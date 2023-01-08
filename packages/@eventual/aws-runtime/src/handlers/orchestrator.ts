import "@eventual/entry/injected";

import { createOrchestrator, LogAgent } from "@eventual/core";
import middy from "@middy/core";
import type { SQSEvent, SQSRecord } from "aws-lambda";
import { logger, loggerMiddlewares } from "../logger.js";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import {
  createEventClient,
  createExecutionHistoryClient,
  createLogsClient,
  createTimerClient,
  createWorkflowClient,
  createWorkflowRuntimeClient,
  SQSWorkflowTaskMessage,
} from "../clients/index.js";

/**
 * Creates an entrypoint function for orchestrating a workflow
 * from within an AWS Lambda Function attached to a SQS FIFO queue.
 */
const orchestrate = createOrchestrator({
  executionHistoryClient: createExecutionHistoryClient(),
  timerClient: createTimerClient(),
  workflowRuntimeClient: createWorkflowRuntimeClient(),
  workflowClient: createWorkflowClient(),
  eventClient: createEventClient(),
  metricsClient: AWSMetricsClient,
  logger,
  logAgent: new LogAgent({ logClient: createLogsClient() }),
});

export default middy(async (event: SQSEvent) => {
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
}).use(loggerMiddlewares);

function sqsRecordToTask(sqsRecord: SQSRecord) {
  const message = JSON.parse(sqsRecord.body) as SQSWorkflowTaskMessage;

  return message.task;
}
