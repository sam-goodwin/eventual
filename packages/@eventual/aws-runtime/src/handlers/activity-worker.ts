// the user's entry point will register activities as a side effect.
import "@eventual/injected/entry.js";

import { ActivityWorkerRequest } from "@eventual/core";
import {
  createActivityWorker,
  GlobalActivityProvider
} from "@eventual/runtime-core";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import {
  createActivityStore,
  createEventClient,
  createExecutionQueueClient,
  createLogAgent,
  createServiceClient,
  createTimerClient
} from "../create.js";

export default (request: ActivityWorkerRequest) =>
  createActivityWorker({
    executionQueueClient: createExecutionQueueClient(),
    eventClient: createEventClient(),
    timerClient: createTimerClient(),
    metricsClient: AWSMetricsClient,
    activityProvider: new GlobalActivityProvider(),
    serviceClient: createServiceClient(),
    logAgent: createLogAgent(),
    activityStore: createActivityStore(),
  })(request);
