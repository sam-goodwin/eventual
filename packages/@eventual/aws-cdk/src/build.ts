import { build, BuildSource, infer } from "@eventual/compiler";
import { HttpOperation, ServiceType } from "@eventual/core";
import fs from "fs";
import path from "path";
import { ApiFunction, BuildManifest } from "./build-manifest";
import { execSync } from "child_process";
import { Code } from "aws-cdk-lib/aws-lambda";

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
  const appSpec = await infer(request.entry);

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
  ] = await Promise.all([bundleApis(), bundleFunctions()] as const);

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
      schemas: appSpec.events.schemas,
      default: {
        file: eventHandler!,
        subscriptions: appSpec.events.subscriptions,
      },
      handlers: appSpec.events.handlers.map((handler) => ({
        file: handler.sourceLocation.fileName,
        subscriptions: handler.subscriptions,
        memorySize: handler.runtimeProps?.memorySize,
        timeout: handler.runtimeProps?.timeout,
        exportName: handler.sourceLocation.exportName,
      })),
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

  async function bundleApis() {
    const routes = await Promise.all(
      appSpec.api.routes.map(async (route) => {
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

  function bundleFunctions() {
    return Promise.all(
      (
        [
          {
            name: ServiceType.OrchestratorWorker,
            entry: runtimeHandlersEntrypoint("orchestrator"),
            eventualTransform: true,
            serviceType: ServiceType.OrchestratorWorker,
            injectedEntry: request.entry,
          },
          {
            name: ServiceType.ActivityWorker,
            entry: runtimeHandlersEntrypoint("activity-worker"),
            serviceType: ServiceType.ActivityWorker,
            injectedEntry: request.entry,
          },
          {
            name: ServiceType.ApiHandler,
            entry: runtimeHandlersEntrypoint("api-handler"),
            serviceType: ServiceType.ApiHandler,
            injectedEntry: request.entry,
          },
          {
            name: ServiceType.EventHandler,
            entry: runtimeHandlersEntrypoint("event-handler"),
            serviceType: ServiceType.EventHandler,
            injectedEntry: request.entry,
          },
          {
            name: "SchedulerForwarder",
            entry: runtimeHandlersEntrypoint("schedule-forwarder"),
            injectedEntry: request.entry,
          },
          {
            name: "SchedulerHandler",
            entry: runtimeHandlersEntrypoint("timer-handler"),
            injectedEntry: request.entry,
          },
          {
            name: "list-workflows",
            entry: runtimeHandlersEntrypoint("api/list-workflows"),
            injectedEntry: request.entry,
          },
          {
            name: "start-execution",
            entry: runtimeHandlersEntrypoint("api/executions/new"),
            injectedEntry: request.entry,
          },
          {
            name: "list-executions",
            entry: runtimeHandlersEntrypoint("api/executions/list"),
            injectedEntry: request.entry,
          },
          {
            name: "get-execution",
            entry: runtimeHandlersEntrypoint("api/executions/get"),
            injectedEntry: request.entry,
          },
          {
            name: "executions-events",
            entry: runtimeHandlersEntrypoint("api/executions/history"),
            injectedEntry: request.entry,
          },
          {
            name: "send-signal",
            entry: runtimeHandlersEntrypoint("api/executions/signals/send"),
            injectedEntry: request.entry,
          },
          {
            name: "executions-history",
            entry: runtimeHandlersEntrypoint("api/executions/workflow-history"),
            injectedEntry: request.entry,
          },
          {
            name: "publish-events",
            entry: runtimeHandlersEntrypoint("api/publish-events"),
            injectedEntry: request.entry,
          },
          {
            name: "update-activity",
            entry: runtimeHandlersEntrypoint("api/update-activity"),
            injectedEntry: request.entry,
          },
        ] satisfies Omit<BuildSource, "outDir">[]
      ).map(buildFunction)
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
