import { createActivityWorker } from "@eventual/core";
import middy from "@middy/core";
import {
  createActivityRuntimeClient,
  createExecutionHistoryClient,
  createWorkflowClient,
} from "../clients/create.js";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import {
  AWSLoggerClient,
  loggerMiddlewares,
} from "../clients/logger-client.js";

export const activityWorker = () =>
  middy(
    createActivityWorker(
      createActivityRuntimeClient(),
      createExecutionHistoryClient(),
      createWorkflowClient(),
      AWSMetricsClient,
      AWSLoggerClient
    )
  ).use(loggerMiddlewares);
