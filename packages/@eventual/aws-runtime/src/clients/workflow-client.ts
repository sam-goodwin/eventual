import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  WorkflowEvent,
  WorkflowTask,
  WorkflowStarted,
  Execution,
  ExecutionStatus,
  WorkflowEventType,
} from "@eventual/core";
import { ulid } from "ulid";
import { ExecutionHistoryClient } from "./execution-history-client.js";

export interface WorkflowClientProps {
  readonly dynamo: DynamoDBClient;
  readonly tableName: string;
  readonly sqs: SQSClient;
  readonly workflowQueueUrl: string;
  readonly executionHistory: ExecutionHistoryClient;
}

export class WorkflowClient {
  constructor(private props: WorkflowClientProps) {}

  public async startWorkflow(name: string, input: any) {
    const executionId = `execution_${name ? name : ulid()}`;

    await this.props.dynamo.send(
      new PutItemCommand({
        Item: {
          pk: { S: ExecutionRecord.PRIMARY_KEY },
          sk: { S: ExecutionRecord.sortKey(executionId) },
          id: { S: executionId },
          status: { S: ExecutionStatus.IN_PROGRESS },
          startTime: { S: new Date().toISOString() },
        },
        TableName: this.props.tableName,
      })
    );

    const workflowStartedEvent =
      await this.props.executionHistory.createAndPutEvent<WorkflowStarted>(
        executionId,
        {
          type: WorkflowEventType.WorkflowStarted,
          input,
        }
      );

    await this.submitWorkflowTask(executionId, workflowStartedEvent);

    return executionId;
  }

  public async submitWorkflowTask(
    executionId: string,
    ...events: WorkflowEvent[]
  ) {
    // send workflow task to workflow queue
    const workflowTask: SQSWorkflowTaskMessage = {
      event: {
        executionId,
        events,
      },
    };

    await this.props.sqs.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(workflowTask),
        QueueUrl: this.props.workflowQueueUrl,
        MessageGroupId: executionId,
        // just de-dupe with itself
        MessageDeduplicationId: `${executionId}_${ulid()}`,
      })
    );
  }
}

export interface SQSWorkflowTaskMessage {
  event: WorkflowTask;
}

export interface ExecutionRecord extends Omit<Execution, "result"> {
  pk: typeof ExecutionRecord.PRIMARY_KEY;
  sk: `${typeof ExecutionRecord.SORT_KEY_PREFIX}${string}`;
  result: string;
}

export namespace ExecutionRecord {
  export const PRIMARY_KEY = "Execution";
  export const SORT_KEY_PREFIX = `Execution$`;
  export function sortKey(executionId: string) {
    return `${SORT_KEY_PREFIX}${executionId}`;
  }
}

export function createExecutionFromResult(
  execution: ExecutionRecord
): Execution {
  const { result, pk, sk, ...rest } = execution;

  return {
    ...rest,
    result: result ? JSON.parse(result) : undefined,
  };
}
