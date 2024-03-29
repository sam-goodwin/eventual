import serviceSpec from "@eventual/injected/spec";
// the user's entry point will register tasks as a side effect.
import "@eventual/injected/entry";

import {
  createTaskWorker,
  GlobalTaskProvider,
  TaskFallbackRequest,
  TaskWorkerRequest,
} from "@eventual/core-runtime";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import {
  createBucketStore,
  createEntityStore,
  createEventClient,
  createExecutionQueueClient,
  createExecutionStore,
  createLogAgent,
  createLogsClient,
  createOpenSearchClient,
  createQueueClient,
  createServiceClient,
  createSocketClient,
  createTaskClient,
  createTaskStore,
  createTimerClient,
  createTransactionClient,
} from "../create.js";
import { serviceName, serviceUrl } from "../env.js";

const worker = createTaskWorker({
  bucketStore: createBucketStore(),
  entityStore: createEntityStore(),
  eventClient: createEventClient(),
  openSearchClient: await createOpenSearchClient(serviceSpec),
  executionQueueClient: createExecutionQueueClient(),
  queueClient: createQueueClient(),
  logAgent: createLogAgent(),
  metricsClient: AWSMetricsClient,
  // partially uses the runtime clients and partially uses the http client
  serviceClient: createServiceClient({
    eventClient: createEventClient(),
    executionQueueClient: createExecutionQueueClient(),
    // already used by the task client
    executionStore: createExecutionStore(),
    // already used by the log agent
    logsClient: createLogsClient(),
    taskClient: createTaskClient(),
    transactionClient: createTransactionClient(),
  }),
  serviceName,
  serviceSpec,
  serviceUrl,
  socketClient: createSocketClient(),
  taskProvider: new GlobalTaskProvider(),
  taskStore: createTaskStore(),
  timerClient: createTimerClient(),
});

export default async (request: TaskWorkerRequest) => {
  const result = await worker(request);

  /**
   * Throw fallback requests so that only lambda "failures" trigger the "on failure".
   */
  if (result) {
    throw new TaskFallbackRequestError(result);
  }
};

export class TaskFallbackRequestError extends Error {
  constructor(public request: TaskFallbackRequest) {
    super(JSON.stringify(request));
  }
}
