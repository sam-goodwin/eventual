import "@eventual/entry/injected";

import {
  CommandExecutor,
  createOrchestrator,
  ExecutionQueueEventEnvelope,
} from "@eventual/core";
import type { SQSEvent, SQSRecord } from "aws-lambda";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import {
  createActivityClient,
  createEventClient,
  createExecutionHistoryStateStore,
  createExecutionHistoryStore,
  createExecutionQueueClient,
  createLogAgent,
  createTimerClient,
  createWorkflowClient,
} from "../create.js";

/**
 * Creates an entrypoint function for orchestrating a workflow
 * from within an AWS Lambda Function attached to a SQS FIFO queue.
 */
const orchestrate = createOrchestrator({
  executionHistoryStore: createExecutionHistoryStore(),
  timerClient: createTimerClient(),
  workflowClient: createWorkflowClient(),
  metricsClient: AWSMetricsClient,
  logAgent: createLogAgent(),
  executionHistoryStateStore: createExecutionHistoryStateStore(),
  commandExecutor: new CommandExecutor({
    activityClient: createActivityClient(),
    eventClient: createEventClient(),
    executionQueueClient: createExecutionQueueClient(),
    timerClient: createTimerClient(),
    workflowClient: createWorkflowClient(),
  }),
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
