// the user's entry point will register activities as a side effect.
import "@eventual/entry/injected";

import { createActivityWorker } from "@eventual/core";
import middy from "@middy/core";
import {
  createActivityRuntimeClient,
  createEventClient,
  createExecutionHistoryClient,
  createWorkflowClient,
} from "../clients/create.js";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import { logger, loggerMiddlewares } from "../logger.js";

export default middy(
  createActivityWorker({
    activityRuntimeClient: createActivityRuntimeClient(),
    executionHistoryClient: createExecutionHistoryClient(),
    eventClient: createEventClient(),
    workflowClient: createWorkflowClient(),
    metricsClient: AWSMetricsClient,
    logger,
  })
).use(loggerMiddlewares);
