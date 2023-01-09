// the user's entry point will register activities as a side effect.
import "@eventual/entry/injected";

import { createActivityWorker, GlobalActivityProvider } from "@eventual/core";
import {
  createActivityRuntimeClient,
  createEventClient,
  createLogAgent,
  createServiceClient,
  createTimerClient,
  createWorkflowClient,
  createWorkflowRuntimeClient,
} from "../clients/create.js";
import { AWSMetricsClient } from "../clients/metrics-client.js";

export default createActivityWorker({
  activityRuntimeClient: createActivityRuntimeClient(),
  eventClient: createEventClient(),
  workflowClient: createWorkflowClient(),
  timerClient: createTimerClient(),
  metricsClient: AWSMetricsClient,
  activityProvider: new GlobalActivityProvider(),
  serviceClient: createServiceClient(
    createWorkflowRuntimeClient({
      executionHistoryBucket: "NOT_NEEDED",
      activityWorkerFunctionName: "NOT_NEEDED",
      tableName: "NOT_NEEDED",
    })
  ),
  logAgent: createLogAgent(),
});
