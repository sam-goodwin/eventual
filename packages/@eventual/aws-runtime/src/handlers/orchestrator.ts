import "@eventual/injected/entry";

import {
  createDefaultWorkflowCallExecutor,
  createOrchestrator,
  ExecutionQueueEventEnvelope,
  RemoteExecutorProvider,
} from "@eventual/core-runtime";
import type { SQSEvent, SQSRecord } from "aws-lambda";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import {
  createBucketStore,
  createEntityStore,
  createEventClient,
  createExecutionHistoryStateStore,
  createExecutionHistoryStore,
  createExecutionQueueClient,
  createLogAgent,
  createOpenSearchClient,
  createTaskClient,
  createTimerClient,
  createTransactionClient,
  createWorkflowClient,
  createWorkflowProvider,
} from "../create.js";
import { serviceName } from "../env.js";

/**
 * Creates an entrypoint function for orchestrating a workflow
 * from within an AWS Lambda Function attached to a SQS FIFO queue.
 */
const orchestrate = createOrchestrator({
  bucketStore: createBucketStore(),
  executionHistoryStore: createExecutionHistoryStore(),
  executorProvider: new RemoteExecutorProvider({
    executionHistoryStateStore: createExecutionHistoryStateStore(),
  }),
  logAgent: createLogAgent(),
  metricsClient: AWSMetricsClient,
  callExecutor: createDefaultWorkflowCallExecutor({
    bucketStore: createBucketStore(),
    entityStore: createEntityStore(),
    eventClient: createEventClient(),
    executionQueueClient: createExecutionQueueClient(),
    openSearchClient: await createOpenSearchClient(),
    taskClient: createTaskClient(),
    timerClient: createTimerClient(),
    transactionClient: createTransactionClient(),
    workflowClient: createWorkflowClient(),
  }),
  serviceName: serviceName(),
  timerClient: createTimerClient(),
  workflowClient: createWorkflowClient(),
  workflowProvider: createWorkflowProvider(),
});

export default async (event: SQSEvent) => {
  if (event.Records.some((r) => !r.attributes.MessageGroupId)) {
    throw new Error("Expected SQS Records to contain fifo message id");
  }

  const workflowTasks = event.Records.map(sqsRecordToTask);

  const { failedExecutionIds } = await orchestrate(workflowTasks);

  const failedMessageIds = failedExecutionIds.flatMap(
    (executionId) =>
      event.Records.filter(
        (r) => r.attributes.MessageGroupId === executionId
      ).map((record) => record.messageId) ?? []
  );

  return {
    batchItemFailures: failedMessageIds.map((r) => ({
      itemIdentifier: r,
    })),
  };
};

function sqsRecordToTask(sqsRecord: SQSRecord) {
  const message = JSON.parse(sqsRecord.body) as ExecutionQueueEventEnvelope;

  return message.task;
}
