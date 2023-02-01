import { build, BuildSource, infer } from "@eventual/compiler";
import { HttpMethod, ServiceType } from "@eventual/core";
import { Code } from "aws-cdk-lib/aws-lambda";
import { execSync } from "child_process";
import fs from "fs";
import path, { dirname } from "path";
import { ApiFunction, BuildManifest } from "./build-manifest";

export interface BuildOutput extends BuildManifest {}

export class BuildOutput {
  constructor(readonly outDir: string, manifest: BuildManifest) {
    Object.assign(this, manifest);
  }

  public getCode(file: string) {
    return Code.fromAsset(this.resolveFolder(file));
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
    path.resolve(request.outDir),
    JSON.parse(
      fs
        .readFileSync(path.join(request.outDir, "manifest.json"))
        .toString("utf-8")
    )
  );
}

export interface BuildAWSRuntimeProps {
  entry: string;
  outDir: string;
}

export async function buildService(request: BuildAWSRuntimeProps) {
  const outDir = request.outDir;
  const serviceSpec = await infer(request.entry);

  const specPath = path.join(outDir, "spec.json");
  await fs.promises.mkdir(dirname(specPath), { recursive: true });
  // just data extracted from the service, used by the handlers
  // separate from the manifest to avoid circular dependency with the bundles
  // and reduce size of the data injected into the bundles
  await fs.promises.writeFile(specPath, JSON.stringify(serviceSpec));

  const [
    individualApis,
    [
      orchestrator,
      activityWorker,
      defaultApiHandler,
      eventHandler,
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
    bundleApis(specPath),
    bundleFunctions(specPath),
  ] as const);

  const manifest: BuildManifest = {
    orchestrator: {
      file: orchestrator!,
    },
    activities: {
      default: {
        file: activityWorker!,
      },
      handlers: {
        // TODO: bundle activities individually
      },
    },
    events: {
      default: {
        file: eventHandler!,
        subscriptions: serviceSpec.subscriptions,
      },
    },
    scheduler: {
      forwarder: {
        file: scheduleForwarder!,
      },
      timerHandler: {
        file: timerHandler!,
      },
    },
    api: {
      default: {
        file: defaultApiHandler!,
      },
      routes: individualApis,
      internal: {
        "/_eventual/workflows": {
          methods: [HttpMethod.GET],
          file: listWorkflows!,
        },
        "/_eventual/workflows/{name}/executions": {
          methods: [HttpMethod.POST],
          file: startExecution!,
        },
        "/_eventual/executions": {
          methods: [HttpMethod.GET],
          file: listExecutions!,
        },
        "/_eventual/executions/{executionId}": {
          methods: [HttpMethod.GET],
          file: getExecution!,
        },
        "/_eventual/executions/{executionId}/history": {
          methods: [HttpMethod.GET],
          file: executionEvents!,
        },
        "/_eventual/executions/{executionId}/signals": {
          methods: [HttpMethod.PUT],
          file: sendSignal!,
        },
        "/_eventual/executions/{executionId}/workflow-history": {
          methods: [HttpMethod.GET],
          file: executionsHistory!,
        },
        "/_eventual/events": {
          methods: [HttpMethod.PUT],
          file: publishEvents!,
        },
        "/_eventual/activities": {
          methods: [HttpMethod.POST],
          file: updateActivity!,
        },
      },
    },
  };

  await fs.promises.writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  async function bundleApis(specPath: string) {
    const routes = await Promise.all(
      serviceSpec.api.routes.map(async (route) => {
        if (route.sourceLocation?.fileName) {
          return [
            route.path,
            {
              file: await buildFunction({
                name: path.join("api", route.path),
                entry: runtimeHandlersEntrypoint("api-handler"),
                exportName: route.sourceLocation.exportName,
                serviceType: ServiceType.ApiHandler,
                injectedEntry: route.sourceLocation.fileName,
                injectedServiceSpec: specPath,
              }),
              exportName: route.sourceLocation.exportName,
              methods: [route.method],
              memorySize: route.memorySize,
              timeout: route.timeout,
            } satisfies ApiFunction,
          ] as const;
        }
        return undefined;
      })
    );
    return Object.fromEntries(
      routes.filter(
        (route): route is Exclude<typeof route, undefined> =>
          route !== undefined
      )
    );
  }

  function bundleFunctions(specPath: string) {
    return Promise.all(
      (
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
            name: ServiceType.EventHandler,
            entry: runtimeHandlersEntrypoint("event-handler"),
            serviceType: ServiceType.EventHandler,
          },
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
}

function runtimeHandlersEntrypoint(name: string) {
  return path.join(runtimeEntrypoint(), `/handlers/${name}.js`);
}

function runtimeEntrypoint() {
  return path.join(require.resolve("@eventual/aws-runtime"), `../../esm`);
}
