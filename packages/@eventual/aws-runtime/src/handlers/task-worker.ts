import serviceSpec from "@eventual/injected/spec";
// the user's entry point will register tasks as a side effect.
import "@eventual/injected/entry";

import {
  GlobalTaskProvider,
  TaskFallbackRequest,
  TaskWorkerRequest,
  createTaskWorker,
} from "@eventual/core-runtime";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import {
  createEntityClient,
  createEventClient,
  createExecutionQueueClient,
  createExecutionStore,
  createLogAgent,
  createServiceClient,
  createTaskClient,
  createTaskStore,
  createTimerClient,
  createTransactionClient,
} from "../create.js";
import { serviceName, serviceUrl } from "../env.js";

const worker = createTaskWorker({
  executionQueueClient: createExecutionQueueClient(),
  eventClient: createEventClient(),
  timerClient: createTimerClient(),
  metricsClient: AWSMetricsClient,
  taskProvider: new GlobalTaskProvider(),
  // partially uses the runtime clients and partially uses the http client
  serviceClient: createServiceClient({
    taskClient: createTaskClient(),
    eventClient: createEventClient(),
    executionQueueClient: createExecutionQueueClient(),
    // already used by the task client
    executionStore: createExecutionStore(),
    transactionClient: createTransactionClient(),
  }),
  logAgent: createLogAgent(),
  taskStore: createTaskStore(),
  serviceName: serviceName(),
  entityClient: createEntityClient(),
  serviceSpec,
  serviceUrls: [serviceUrl],
});

export default async (request: TaskWorkerRequest) => {
  const result = await worker(request);

  /**
   * Throw fallback requests so that only lambda "failures" trigger the "on failure".
   */
  if (!!result) {
    throw new TaskFallbackRequestError(result);
  }
};

export class TaskFallbackRequestError extends Error {
  constructor(public request: TaskFallbackRequest) {
    super(JSON.stringify(request));
  }
}
