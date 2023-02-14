import { build, BuildSource, infer } from "@eventual/compiler";
import {
  CommandSpec,
  HttpMethod,
  ServiceSpec,
  ServiceType,
  SubscriptionSpec,
} from "@eventual/core";
import { Code } from "aws-cdk-lib/aws-lambda";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  BuildManifest,
  InternalApiRoutes,
  InternalCommandFunction,
  BundledFunction,
} from "./build-manifest";

export interface BuildOutput extends BuildManifest {}

export class BuildOutput {
  // ensure that only one Asset is created per file even if that file is packaged multiple times
  private codeAssetCache: {
    [file: string]: Code;
  } = {};

  constructor(
    readonly serviceName: string,
    readonly outDir: string,
    manifest: BuildManifest
  ) {
    Object.assign(this, manifest);
  }

  public getCode(file: string) {
    return (this.codeAssetCache[file] ??= Code.fromAsset(
      this.resolveFolder(file)
    ));
  }

  public resolveFolder(file: string) {
    return path.dirname(path.resolve(this.outDir, file));
  }
}

export function buildServiceSync(request: BuildAWSRuntimeProps): BuildOutput {
  execSync(
    `node ${require.resolve("./build-cli.js")} ${Buffer.from(
      JSON.stringify(request)
    ).toString("base64")}`
  );

  return new BuildOutput(
    request.serviceName,
    path.resolve(request.outDir),
    JSON.parse(
      fs
        .readFileSync(path.join(request.outDir, "manifest.json"))
        .toString("utf-8")
    )
  );
}

export interface BuildAWSRuntimeProps {
  serviceName: string;
  entry: string;
  outDir: string;
}

export async function buildService(request: BuildAWSRuntimeProps) {
  const outDir = request.outDir;
  const serviceSpec = await infer(request.entry);

  const specPath = path.join(outDir, "spec.json");
  await fs.promises.mkdir(path.dirname(specPath), { recursive: true });
  // just data extracted from the service, used by the handlers
  // separate from the manifest to avoid circular dependency with the bundles
  // and reduce size of the data injected into the bundles
  await fs.promises.writeFile(specPath, JSON.stringify(serviceSpec, null, 2));

  const [
    [
      // bundle the default handlers first as we refer to them when bundling all of the individual handlers
      orchestrator,
      monoActivityFunction,
      monoCommandFunction,
      monoSubscriptionFunction,
    ],
    [
      // also bundle each of the internal eventual API Functions as they have no dependencies
      scheduleForwarder,
      timerHandler,
      listWorkflows,
      startExecution,
      listExecutions,
      getExecution,
      executionEvents,
      sendSignal,
      executionsHistory,
      publishEvents,
      updateActivity,
    ],
  ] = await Promise.all([
    bundleMonolithDefaultHandlers(specPath),
    bundleEventualAPIFunctions(specPath),
  ]);

  // then, bundle each of the commands and subscriptions
  const [commands, subscriptions] = await Promise.all([
    bundle(specPath, "commands"),
    bundle(specPath, "subscriptions"),
  ] as const);

  const manifest: BuildManifest = {
    orchestrator: {
      file: orchestrator!,
    },
    activities: {
      file: monoActivityFunction!,
    },
    events: serviceSpec.events,
    subscriptions,
    scheduler: {
      forwarder: {
        file: scheduleForwarder!,
      },
      timerHandler: {
        file: timerHandler!,
      },
    },
    commands: {
      ...commands,
      default: {
        file: monoCommandFunction!,
        spec: {
          name: "default",
        },
      },
    },
    api: manifestInternalAPI() as any,
  };

  await fs.promises.writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  type SpecFor<Type extends "subscriptions" | "commands"> =
    Type extends "commands" ? CommandSpec : SubscriptionSpec;

  async function bundle<Type extends "subscriptions" | "commands">(
    specPath: string,
    type: Type
  ): Promise<{
    [k in keyof ServiceSpec[Type]]: BundledFunction<SpecFor<Type>>;
  }> {
    const routes = await Promise.all(
      Object.values(serviceSpec[type]).map(
        async (
          spec: SpecFor<Type>
        ): Promise<
          readonly [string, BundledFunction<CommandSpec | SubscriptionSpec>]
        > => {
          if (spec.sourceLocation?.fileName) {
            // we know the source location of the command, so individually build it from that
            // file and create a separate (optimized bundle) for it
            // TODO: generate an index.ts that imports { exportName } from "./sourceLocation" for enhanced bundling
            // TODO: consider always bundling from the root index.ts instead of arbitrarily via ESBuild+SWC AST transformer
            return [
              spec.name,
              {
                spec,
                file: await buildFunction({
                  name: path.join(
                    type === "commands" ? "command" : "subscription",
                    spec.name
                  ),
                  entry: runtimeHandlersEntrypoint(
                    type === "subscriptions" ? "event-handler" : "api-handler"
                  ),
                  exportName: spec.sourceLocation.exportName,
                  serviceType:
                    type === "commands"
                      ? ServiceType.ApiHandler
                      : ServiceType.Subscription,
                  injectedEntry: spec.sourceLocation.fileName,
                  injectedServiceSpec: specPath,
                }),
              },
            ] as const;
          } else {
            // if we don't know the location of this command (because it is not exported)
            // then use the default monolithic handler
            // we'll still create a separate Lambda Function for each command though
            return [
              spec.name,
              {
                spec: spec,
                file:
                  type === "commands"
                    ? monoCommandFunction!
                    : monoSubscriptionFunction!,
              },
            ] as const;
          }
        }
      )
    );
    return Object.fromEntries(
      routes.filter(
        (route): route is Exclude<typeof route, undefined> =>
          route !== undefined
      )
    ) as {
      [k in keyof ServiceSpec[Type]]: BundledFunction<SpecFor<Type>>;
    };
  }

  function bundleMonolithDefaultHandlers(specPath: string) {
    return Promise.all(
      [
        {
          name: ServiceType.OrchestratorWorker,
          entry: runtimeHandlersEntrypoint("orchestrator"),
          eventualTransform: true,
          serviceType: ServiceType.OrchestratorWorker,
        },
        {
          name: ServiceType.ActivityWorker,
          entry: runtimeHandlersEntrypoint("activity-worker"),
          serviceType: ServiceType.ActivityWorker,
        },
        {
          name: ServiceType.ApiHandler,
          entry: runtimeHandlersEntrypoint("api-handler"),
          serviceType: ServiceType.ApiHandler,
        },
        {
          name: ServiceType.Subscription,
          entry: runtimeHandlersEntrypoint("event-handler"),
          serviceType: ServiceType.Subscription,
        },
      ]
        .map((s) => ({
          ...s,
          injectedEntry: request.entry,
          injectedServiceSpec: specPath,
        }))
        .map(buildFunction)
    );
  }

  function bundleEventualAPIFunctions(specPath: string) {
    return Promise.all(
      (
        [
          {
            name: "SchedulerForwarder",
            entry: runtimeHandlersEntrypoint("schedule-forwarder"),
          },
          {
            name: "SchedulerHandler",
            entry: runtimeHandlersEntrypoint("timer-handler"),
          },
          {
            name: "list-workflows",
            entry: runtimeHandlersEntrypoint("api/list-workflows"),
          },
          {
            name: "start-execution",
            entry: runtimeHandlersEntrypoint("api/executions/new"),
          },
          {
            name: "list-executions",
            entry: runtimeHandlersEntrypoint("api/executions/list"),
          },
          {
            name: "get-execution",
            entry: runtimeHandlersEntrypoint("api/executions/get"),
          },
          {
            name: "executions-events",
            entry: runtimeHandlersEntrypoint("api/executions/history"),
          },
          {
            name: "send-signal",
            entry: runtimeHandlersEntrypoint("api/executions/signals/send"),
          },
          {
            name: "executions-history",
            entry: runtimeHandlersEntrypoint("api/executions/workflow-history"),
          },
          {
            name: "publish-events",
            entry: runtimeHandlersEntrypoint("api/publish-events"),
          },
          {
            name: "update-activity",
            entry: runtimeHandlersEntrypoint("api/update-activity"),
          },
        ] satisfies Omit<
          BuildSource,
          "outDir" | "injectedEntry" | "injectedServiceSpec"
        >[]
      )
        .map((s) => ({
          ...s,
          injectedEntry: request.entry,
          injectedServiceSpec: specPath,
        }))
        .map(buildFunction)
    );
  }

  async function buildFunction(input: Omit<BuildSource, "outDir">) {
    const file = await build({
      ...input,
      outDir: request.outDir,
    });
    return path.relative(path.resolve(request.outDir), path.resolve(file));
  }

  function manifestInternalAPI() {
    return Object.fromEntries([
      internalCommand({
        name: "listWorkflows",
        path: "/_eventual/workflows",
        method: "GET",
        file: listWorkflows!,
      }),
      internalCommand({
        name: "startExecution",
        path: "/_eventual/workflows/{name}/executions",
        method: "POST",
        file: startExecution!,
      }),
      internalCommand({
        name: "listExecutions",
        path: "/_eventual/executions",
        method: "GET",
        file: listExecutions!,
      }),
      internalCommand({
        name: "getExecution",
        path: "/_eventual/executions/{executionId}",
        method: "GET",
        file: getExecution!,
      }),
      internalCommand({
        name: "listExecutionEvents",
        path: "/_eventual/executions/{executionId}/history",
        method: "GET",
        file: executionEvents!,
      }),
      internalCommand({
        name: "sendSignal",
        path: "/_eventual/executions/{executionId}/signals",
        method: "PUT",
        file: sendSignal!,
      }),
      internalCommand({
        name: "getExecutionHistory",
        path: "/_eventual/executions/{executionId}/workflow-history",
        method: "GET",
        file: executionsHistory!,
      }),
      internalCommand({
        name: "publishEvents",
        path: "/_eventual/events",
        method: "PUT",
        file: publishEvents!,
      }),
      internalCommand({
        name: "updateActivity",
        path: "/_eventual/activities",
        method: "POST",
        file: updateActivity!,
      }),
    ] as const);

    function internalCommand<P extends keyof InternalApiRoutes>(props: {
      name: string;
      path: P;
      method: HttpMethod;
      file: string;
    }) {
      return [
        props.path,
        {
          spec: {
            name: props.name,
            path: props.path,
            method: props.method,
            passThrough: true,
            internal: true,
          },
          file: props.file,
        } satisfies InternalCommandFunction,
      ] as const;
    }
  }
}

function runtimeHandlersEntrypoint(name: string) {
  return path.join(runtimeEntrypoint(), `/handlers/${name}.js`);
}

function runtimeEntrypoint() {
  return path.join(require.resolve("@eventual/aws-runtime"), `../../esm`);
}
