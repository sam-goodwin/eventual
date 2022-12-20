import "@eventual/entry/injected";

import { createOrchestrator } from "@eventual/core";
import middy from "@middy/core";
import type { SQSEvent, SQSRecord } from "aws-lambda";
import { logger, loggerMiddlewares } from "../logger.js";
import { AWSMetricsClient } from "../clients/metrics-client.js";
import {
  createEventClient,
  createExecutionHistoryClient,
  createTimerClient,
  createWorkflowClient,
  createWorkflowRuntimeClient,
  SQSWorkflowTaskMessage,
} from "../clients/index.js";

/**
 * Creates an entrypoint function for orchestrating a workflow
 * from within an AWS Lambda Function attached to a SQS FIFO queue.
 */
const orchestrator = createOrchestrator({
  executionHistoryClient: createExecutionHistoryClient(),
  timerClient: createTimerClient(),
  workflowRuntimeClient: createWorkflowRuntimeClient(),
  workflowClient: createWorkflowClient(),
  eventClient: createEventClient(),
  metricsClient: AWSMetricsClient,
  logger,
});

export default middy(async (event: SQSEvent) => {
  if (event.Records.some((r) => !r.attributes.MessageGroupId)) {
    throw new Error("Expected SQS Records to contain fifo message id");
  }

  // batch by execution id
  const recordsByExecutionId = groupBy(
    event.Records,
    (r) => r.attributes.MessageGroupId!
  );

  const eventsByExecutionId = Object.fromEntries(
    Object.entries(recordsByExecutionId).map(([executionId, records]) => [
      executionId,
      sqsRecordsToEvents(records),
    ])
  );

  const { failedExecutionIds } = await orchestrator.orchestrateExecutions(
    eventsByExecutionId
  );

  const failedMessageIds = failedExecutionIds.flatMap(
    (executionId) =>
      recordsByExecutionId[executionId]?.map((record) => record.messageId) ?? []
  );

  return {
    batchItemFailures: failedMessageIds.map((r) => ({
      itemIdentifier: r,
    })),
  };
}).use(loggerMiddlewares);

function sqsRecordsToEvents(sqsRecords: SQSRecord[]) {
  return sqsRecords.flatMap(sqsRecordToEvents);
}

function sqsRecordToEvents(sqsRecord: SQSRecord) {
  const message = JSON.parse(sqsRecord.body) as SQSWorkflowTaskMessage;

  return message.task.events;
}

function groupBy<T>(
  items: T[],
  extract: (item: T) => string
): Record<string, T[]> {
  return items.reduce((obj: Record<string, T[]>, r) => {
    const id = extract(r);
    return {
      ...obj,
      [id]: [...(obj[id] || []), r],
    };
  }, {});
}
