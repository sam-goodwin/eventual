// the user's entry point will register activities as a side effect.
import "@eventual/entry/injected";

import {
  ActivityWorkerRequest,
  createActivityWorker,
  GlobalActivityProvider,
  LogAgent,
  LogLevel,
} from "@eventual/core";
import middy from "@middy/core";
import {
  createActivityRuntimeClient,
  createEventClient,
  createLogsClient,
  createServiceClient,
  createTimerClient,
  createWorkflowClient,
  createWorkflowRuntimeClient,
} from "../clients/create.js";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import { logger, loggerMiddlewares } from "../logger.js";
import { ENV_NAMES } from "src/env.js";

export default middy<ActivityWorkerRequest>((request) =>
  createActivityWorker({
    activityRuntimeClient: createActivityRuntimeClient(),
    eventClient: createEventClient(),
    workflowClient: createWorkflowClient(),
    timerClient: createTimerClient(),
    metricsClient: AWSMetricsClient,
    logger,
    activityProvider: new GlobalActivityProvider(),
    serviceClient: createServiceClient(
      createWorkflowRuntimeClient({
        executionHistoryBucket: "NOT_NEEDED",
        activityWorkerFunctionName: "NOT_NEEDED",
        tableName: "NOT_NEEDED",
      })
    ),
    logAgent: new LogAgent({
      logClient: createLogsClient(),
      logLevel: {
        default:
          (process.env[ENV_NAMES.DEFAULT_LOG_LEVEL] as LogLevel | undefined) ??
          "INFO",
      },
    }),
  })(request, new Date())
).use(loggerMiddlewares);
