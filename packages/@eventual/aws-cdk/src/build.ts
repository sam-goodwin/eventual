import { build, BuildSource, infer } from "@eventual/compiler";
import { ActivitySpec } from "@eventual/core";
import {
  CommandSpec,
  EVENTUAL_SYSTEM_COMMAND_NAMESPACE,
  ServiceType,
  SubscriptionSpec,
} from "@eventual/core/internal";
import { Code } from "aws-cdk-lib/aws-lambda";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  BuildManifest,
  BundledFunction,
  InternalCommandFunction,
  InternalCommandName,
  InternalCommands,
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
      activityFallbackHandler,
      scheduleForwarder,
      timerHandler,
    ],
  ] = await Promise.all([
    bundleMonolithDefaultHandlers(specPath),
    bundleEventualSystemFunctions(specPath),
  ]);

  // then, bundle each of the commands and subscriptions
  const [commands, subscriptions, activities] = await Promise.all([
    bundle(specPath, "commands"),
    bundle(specPath, "subscriptions"),
    bundle(specPath, "activities"),
  ] as const);

  const manifest: BuildManifest = {
    serviceName: request.serviceName,
    entry: request.entry,
    activities: activities,
    events: serviceSpec.events,
    subscriptions,
    commands: [
      ...commands,
      {
        entry: monoCommandFunction!,
        spec: {
          name: "default",
        },
      },
    ],
    system: {
      activityService: {
        fallbackHandler: { entry: activityFallbackHandler! },
      },
      eventualService: {
        commands: await bundleSystemCommandFunctions(specPath),
      },
      schedulerService: {
        forwarder: {
          entry: scheduleForwarder!,
        },
        timerHandler: {
          entry: timerHandler!,
        },
      },
      workflowService: {
        orchestrator: {
          entry: orchestrator!,
        },
      },
    },
  };

  await fs.promises.writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  type SpecFor<Type extends "subscriptions" | "commands" | "activities"> =
    Type extends "commands"
      ? CommandSpec
      : Type extends "subscriptions"
      ? SubscriptionSpec
      : ActivitySpec;

  async function bundle<
    Type extends "subscriptions" | "commands" | "activities"
  >(specPath: string, type: Type): Promise<BundledFunction<SpecFor<Type>>[]> {
    return await Promise.all(
      (serviceSpec[type] as SpecFor<Type>[]).map(async (spec) => {
        const [pathPrefix, entry, name, monoFunction] =
          type === "commands"
            ? ([
                "command",
                "command-worker",
                spec.name,
                monoCommandFunction!,
              ] as const)
            : type === "subscriptions"
            ? ([
                "subscription",
                "subscription-worker",
                spec.name,
                monoSubscriptionFunction!,
              ] as const)
            : ([
                "activity",
                "activity-worker",
                spec.name,
                monoActivityFunction!,
              ] as const);

        return {
          entry: await bundleFile(
            specPath,
            spec,
            pathPrefix,
            entry,
            name,
            monoFunction
          ),
          spec,
        };
      })
    );
  }

  async function bundleFile<
    Spec extends CommandSpec | SubscriptionSpec | ActivitySpec
  >(
    specPath: string,
    spec: Spec,
    pathPrefix: string,
    entryPoint: string,
    name: string,
    monoFunction: string
  ): Promise<string> {
    return spec.sourceLocation?.fileName
      ? // we know the source location of the command, so individually build it from that
        // file and create a separate (optimized bundle) for it
        // TODO: generate an index.ts that imports { exportName } from "./sourceLocation" for enhanced bundling
        // TODO: consider always bundling from the root index.ts instead of arbitrarily via ESBuild+SWC AST transformer
        await buildFunction({
          name: path.join(pathPrefix, name),
          entry: runtimeHandlersEntrypoint(entryPoint),
          exportName: spec.sourceLocation.exportName,
          injectedEntry: spec.sourceLocation.fileName,
          injectedServiceSpec: specPath,
        })
      : monoFunction;
  }

  function bundleMonolithDefaultHandlers(specPath: string) {
    return Promise.all(
      [
        {
          name: ServiceType.OrchestratorWorker,
          entry: runtimeHandlersEntrypoint("orchestrator"),
          eventualTransform: true,
        },
        {
          name: ServiceType.ActivityWorker,
          entry: runtimeHandlersEntrypoint("activity-worker"),
        },
        {
          name: ServiceType.CommandWorker,
          entry: runtimeHandlersEntrypoint("command-worker"),
        },
        {
          name: ServiceType.Subscription,
          entry: runtimeHandlersEntrypoint("subscription-worker"),
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

  /**
   * The system command entry files currently come with their own instance of the
   * {@link CommandWorker}. Just bundle each file with a synthetic command spec.
   */
  async function bundleSystemCommandFunctions(
    specPath: string
  ): Promise<InternalCommands> {
    const commands: Record<InternalCommandName, { entry: string }> = {
      listWorkflows: {
        entry: runtimeHandlersEntrypoint("system-commands/list-workflows"),
      },
      startExecution: {
        entry: runtimeHandlersEntrypoint("system-commands/start-execution"),
      },
      listExecutions: {
        entry: runtimeHandlersEntrypoint("system-commands/list-executions"),
      },
      getExecution: {
        entry: runtimeHandlersEntrypoint("system-commands/get-execution"),
      },
      getExecutionHistory: {
        entry: runtimeHandlersEntrypoint(
          "system-commands/get-execution-history"
        ),
      },
      sendSignal: {
        entry: runtimeHandlersEntrypoint("system-commands/send-signal"),
      },
      getExecutionWorkflowHistory: {
        entry: runtimeHandlersEntrypoint(
          "system-commands/get-execution-workflow-history"
        ),
      },
      publishEvents: {
        entry: runtimeHandlersEntrypoint("system-commands/publish-events"),
      },
      updateActivity: {
        entry: runtimeHandlersEntrypoint("system-commands/update-activity"),
      },
    };

    return Object.fromEntries(
      await Promise.all(
        Object.entries(commands).map(async ([name, { entry }]) => {
          const file = await buildFunction({
            name,
            entry,
            injectedEntry: request.entry,
            injectedServiceSpec: specPath,
          });
          return [
            name,
            {
              entry: file,
              spec: { name, namespace: EVENTUAL_SYSTEM_COMMAND_NAMESPACE },
            } satisfies InternalCommandFunction,
          ];
        })
      )
    );
  }

  function bundleEventualSystemFunctions(specPath: string) {
    return Promise.all(
      (
        [
          {
            name: "ActivityFallbackHandler",
            entry: runtimeHandlersEntrypoint("activity-fallback-handler"),
          },
          {
            name: "SchedulerForwarder",
            entry: runtimeHandlersEntrypoint("schedule-forwarder"),
          },
          {
            name: "SchedulerHandler",
            entry: runtimeHandlersEntrypoint("timer-handler"),
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
}

function runtimeHandlersEntrypoint(name: string) {
  return path.join(runtimeEntrypoint(), `/handlers/${name}.js`);
}

function runtimeEntrypoint() {
  return path.join(require.resolve("@eventual/aws-runtime"), `../../esm`);
}
