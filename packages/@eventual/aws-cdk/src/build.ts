/* eslint-disable @typescript-eslint/no-empty-interface */
/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

import { build, BuildSource, infer } from "@eventual/compiler";
import { BuildManifest, QueueRuntime } from "@eventual/core-runtime";
import {
  BucketNotificationHandlerSpec,
  CommandSpec,
  EntityStreamSpec,
  EVENTUAL_SYSTEM_COMMAND_NAMESPACE,
  QueueHandlerSpec,
  QueueSpec,
  SocketSpec,
  SubscriptionSpec,
  TaskSpec,
} from "@eventual/core/internal";
import { Code } from "aws-cdk-lib/aws-lambda";
import { execSync } from "child_process";
import fs from "fs";
import type openapi from "openapi3-ts";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const _require = createRequire(import.meta.url);

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
    `node ${_require.resolve("./build-cli.js")} ${Buffer.from(
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
  openApi: {
    info: openapi.InfoObject;
  };
}

const WORKER_ENTRY_POINTS = [
  "orchestrator",
  "task-worker",
  "command-worker",
  "subscription-worker",
  "entity-stream-worker",
  "bucket-handler-worker",
  "queue-handler-worker",
  "transaction-worker",
  "socket-worker",
] as const;

export async function buildService(request: BuildAWSRuntimeProps) {
  const outDir = request.outDir;
  const serviceSpec = await infer(request.entry, request.openApi);

  const specPath = path.join(outDir, "spec.json");
  await fs.promises.mkdir(path.dirname(specPath), { recursive: true });
  // just data extracted from the service, used by the handlers
  // separate from the manifest to avoid circular dependency with the bundles
  // and reduce size of the data injected into the bundles
  await fs.promises.writeFile(specPath, JSON.stringify(serviceSpec, null, 2));

  const [
    monolithFunctions,
    [
      // also bundle each of the internal eventual API Functions as they have no dependencies
      taskFallbackHandler,
      scheduleForwarder,
      timerHandler,
      searchIndexCustomResourceHandler,
    ],
  ] = await Promise.all([
    bundleMonolithDefaultHandlers(specPath),
    bundleEventualSystemFunctions(specPath),
  ]);

  // then, bundle each of the commands and subscriptions
  const [commands, subscriptions, tasks] = await Promise.all([
    bundleCommands(serviceSpec.commands),
    bundleSubscriptions(serviceSpec.subscriptions),
    bundleTasks(serviceSpec.tasks),
  ] as const);

  const manifest: BuildManifest = {
    serviceName: request.serviceName,
    entry: request.entry,
    tasks,
    events: serviceSpec.events,
    subscriptions,
    commands,
    commandDefault: {
      entry: monolithFunctions["command-worker"],
      spec: {
        name: "default",
      },
    },
    sockets: await bundleSocketHandlers(serviceSpec.sockets),
    search: serviceSpec.search,
    entities: {
      entities: await Promise.all(
        serviceSpec.entities.entities.map(async (d) => ({
          ...d,
          streams: await bundleEntityStreams(d.streams),
        }))
      ),
      transactions: serviceSpec.transactions,
    },
    buckets: {
      buckets: await Promise.all(
        serviceSpec.buckets.buckets.map(async (b) => ({
          ...b,
          handlers: await bundleBucketHandlers(b.handlers),
        }))
      ),
    },
    queues: {
      queues: await Promise.all(
        serviceSpec.queues.map(
          async (q) =>
            ({
              ...q,
              handler: await bundleQueueHandler(q),
            } satisfies QueueRuntime)
        )
      ),
    },
    system: {
      entityService: {
        transactionWorker: { entry: monolithFunctions["transaction-worker"] },
      },
      taskService: {
        fallbackHandler: { entry: taskFallbackHandler! },
      },
      eventualService: {
        systemCommandHandler: {
          entry: await buildFunction({
            entry: runtimeHandlersEntrypoint("system-command-handler"),
            name: "systemDefault",
            injectedEntry: request.entry,
            injectedServiceSpec: specPath,
          }),
        },
        commands: [
          "getExecutionLogs",
          "listWorkflows",
          "startExecution",
          "listExecutions",
          "getExecution",
          "getExecutionHistory",
          "sendSignal",
          "getExecutionWorkflowHistory",
          "emitEvents",
          "updateTask",
          "executeTransaction",
        ].map((name) => ({
          name,
          namespace: EVENTUAL_SYSTEM_COMMAND_NAMESPACE,
        })),
      },
      schedulerService: {
        forwarder: {
          entry: scheduleForwarder!,
          handler: "index.handle",
        },
        timerHandler: {
          entry: timerHandler!,
          handler: "index.handle",
        },
      },
      searchService: {
        customResourceHandler: {
          entry: searchIndexCustomResourceHandler!,
          handler: "index.handle",
        },
      },
      workflowService: {
        orchestrator: {
          entry: monolithFunctions.orchestrator!,
        },
      },
    },
  };

  await fs.promises.writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  async function bundleCommands(commandSpecs: CommandSpec[]) {
    return await Promise.all(
      commandSpecs.map(async (spec) => {
        return {
          entry: await bundleFile(
            spec,
            "command",
            "command-worker",
            spec.name,
            spec.externalModules
          ),
          spec,
        };
      })
    );
  }

  async function bundleSubscriptions(specs: SubscriptionSpec[]) {
    return await Promise.all(
      specs.map(async (spec) => {
        return {
          entry: await bundleFile(
            spec,
            "subscription",
            "subscription-worker",
            spec.name,
            spec.props?.externalModules
          ),
          spec,
        };
      })
    );
  }

  async function bundleTasks(specs: TaskSpec[]) {
    return await Promise.all(
      specs.map(async (spec) => {
        return {
          entry: await bundleFile(
            spec,
            "task",
            "task-worker",
            spec.name,
            spec.options?.externalModules
          ),
          spec,
        };
      })
    );
  }

  async function bundleEntityStreams(specs: EntityStreamSpec[]) {
    return await Promise.all(
      specs.map(async (spec) => {
        return {
          entry: await bundleFile(
            spec,
            "entity-streams",
            "entity-stream-worker",
            spec.name,
            spec.options?.externalModules
          ),
          spec,
        };
      })
    );
  }

  async function bundleBucketHandlers(specs: BucketNotificationHandlerSpec[]) {
    return await Promise.all(
      specs.map(async (spec) => {
        return {
          entry: await bundleFile(
            spec,
            "bucket-handlers",
            "bucket-handler-worker",
            spec.name,
            spec.options?.externalModules
          ),
          spec,
        };
      })
    );
  }

  async function bundleQueueHandler(spec: QueueSpec) {
    return {
      entry: await bundleFile(
        spec.handler,
        "queue-handlers",
        "queue-handler-worker",
        spec.name,
        spec.handler.options?.externalModules
      ),
      spec: spec.handler,
    };
  }

  async function bundleSocketHandlers(specs: SocketSpec[]) {
    return await Promise.all(
      specs.map(async (spec) => {
        return {
          entry: await bundleFile(
            spec,
            "socket",
            "socket-worker",
            spec.name,
            spec.externalModules
          ),
          spec,
        };
      })
    );
  }

  async function bundleFile<
    Spec extends
      | CommandSpec
      | SubscriptionSpec
      | TaskSpec
      | QueueHandlerSpec
      | SocketSpec
      | EntityStreamSpec
      | BucketNotificationHandlerSpec
  >(
    spec: Spec,
    pathPrefix: string,
    entryPoint: (typeof WORKER_ENTRY_POINTS)[number],
    name: string,
    externalModules?: string[]
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
          external: externalModules,
        })
      : monolithFunctions[entryPoint];
  }

  async function bundleMonolithDefaultHandlers(specPath: string) {
    return Object.fromEntries(
      await Promise.all(
        WORKER_ENTRY_POINTS.map(
          async (name) =>
            [
              name,
              await buildFunction({
                entry: runtimeHandlersEntrypoint(name),
                name,
                injectedEntry: request.entry,
                injectedServiceSpec: specPath,
              }),
            ] as const
        )
      )
    ) as Record<(typeof WORKER_ENTRY_POINTS)[number], string>;
  }

  function bundleEventualSystemFunctions(specPath: string) {
    return Promise.all(
      (
        [
          {
            name: "TaskFallbackHandler",
            entry: runtimeHandlersEntrypoint("task-fallback-handler"),
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
            name: "SearchIndexCustomResourceHandler",
            entry: runtimeHandlersEntrypoint(
              "search-index-custom-resource-handler"
            ),
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
  const moduleURL = import.meta.resolve("@eventual/aws-runtime");
  const moduleFilePath = fileURLToPath(moduleURL);
  return path.dirname(moduleFilePath);
}
