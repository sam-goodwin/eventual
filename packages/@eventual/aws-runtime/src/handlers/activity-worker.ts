// the user's entry point will register activities as a side effect.
import "@eventual/entry/injected";

import {
  ActivityWorkerRequest,
  createActivityWorker,
  GlobalActivityProvider,
} from "@eventual/core";
import {
  createActivityStore,
  createEventClient,
  createExecutionQueueClient,
  createLogAgent,
  createServiceClient,
  createTimerClient,
} from "../clients/create.js";
import { AWSMetricsClient } from "../clients/metrics-client.js";

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
