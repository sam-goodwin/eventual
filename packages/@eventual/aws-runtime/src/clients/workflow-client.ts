import {
  AttributeValue,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  WorkflowTask,
  WorkflowStarted,
  Execution,
  ExecutionStatus,
  WorkflowEventType,
  HistoryStateEvent,
} from "@eventual/core";
import { ulid } from "ulidx";
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

  /**
   * Start a workflow execution
   * @param name Suffix of execution id
   * @param input Workflow parameters
   * @returns
   */
  public async startWorkflow({
    name: _name,
    input,
  }: { name?: string; input?: any } = {}) {
    const name = _name ?? ulid();
    const executionId = `execution_${name}`;
    console.log("execution input:", input);

    await this.props.dynamo.send(
      new PutItemCommand({
        Item: {
          pk: { S: ExecutionRecord.PRIMARY_KEY },
          sk: { S: ExecutionRecord.sortKey(executionId) },
          id: { S: executionId },
          name: { S: name },
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
          context: { name },
        }
      );

    await this.submitWorkflowTask(executionId, workflowStartedEvent);

    return executionId;
  }

  public async submitWorkflowTask(
    executionId: string,
    ...events: HistoryStateEvent[]
  ) {
    // send workflow task to workflow queue
    const workflowTask: SQSWorkflowTaskMessage = {
      task: {
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
  task: WorkflowTask;
}

export interface ExecutionRecord {
  pk: { S: typeof ExecutionRecord.PRIMARY_KEY };
  sk: { S: `${typeof ExecutionRecord.SORT_KEY_PREFIX}${string}` };
  result?: AttributeValue.SMember;
  id: AttributeValue.SMember;
  status: { S: ExecutionStatus };
  startTime: AttributeValue.SMember;
  endTime?: AttributeValue.SMember;
  error?: AttributeValue.SMember;
  message?: AttributeValue.SMember;
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
  return {
    id: execution.id.S,
    endTime: execution.endTime?.S,
    error: execution.error?.S,
    message: execution.message?.S,
    result: execution.result ? JSON.parse(execution.result.S) : undefined,
    startTime: execution.startTime.S,
    status: execution.status.S,
  } as Execution;
}
