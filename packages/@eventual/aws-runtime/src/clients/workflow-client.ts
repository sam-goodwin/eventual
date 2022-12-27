import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  Execution,
  ExecutionStatus,
  HistoryStateEvent,
  Workflow,
  WorkflowEventType,
  WorkflowStarted,
  WorkflowTask,
  WorkflowClient,
  StartWorkflowRequest,
  formatExecutionId,
  createEvent,
} from "@eventual/core";
import { ulid } from "ulidx";
import { AWSActivityRuntimeClient } from "./activity-runtime-client.js";

export interface AWSWorkflowClientProps {
  readonly dynamo: DynamoDBClient;
  readonly tableName: string;
  readonly sqs: SQSClient;
  readonly workflowQueueUrl: string;
  readonly activityRuntimeClient: AWSActivityRuntimeClient;
}

export class AWSWorkflowClient extends WorkflowClient {
  constructor(private props: AWSWorkflowClientProps) {
    super(props.activityRuntimeClient);
  }

  /**
   * Start a workflow execution
   * @param name Suffix of execution id
   * @param input Workflow parameters
   * @returns
   */
  public async startWorkflow<W extends Workflow = Workflow>({
    executionName = ulid(),
    workflowName,
    input,
    parentExecutionId,
    seq,
    timeoutSeconds,
  }: StartWorkflowRequest<W>) {
    const executionId = formatExecutionId(workflowName, executionName);
    console.log("execution input:", input);

    await this.props.dynamo.send(
      new PutItemCommand({
        TableName: this.props.tableName,
        Item: {
          pk: { S: ExecutionRecord.PRIMARY_KEY },
          sk: { S: ExecutionRecord.sortKey(executionId) },
          id: { S: executionId },
          name: { S: executionName },
          workflowName: { S: workflowName },
          status: { S: ExecutionStatus.IN_PROGRESS },
          startTime: { S: new Date().toISOString() },
          ...(parentExecutionId
            ? {
                parentExecutionId: { S: parentExecutionId },
                seq: { N: seq!.toString(10) },
              }
            : {}),
        },
      })
    );

    const workflowStartedEvent = createEvent<WorkflowStarted>({
      type: WorkflowEventType.WorkflowStarted,
      input,
      workflowName,
      // generate the time for the workflow to timeout based on when it was started.
      // the timer will be started by the orchestrator so the client does not need to have access to the timer client.
      timeoutTime: timeoutSeconds
        ? new Date(new Date().getTime() + timeoutSeconds * 1000).toISOString()
        : undefined,
      context: {
        name: executionName,
        parentId: parentExecutionId,
      },
    });

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
      })
    );
  }

  public async getExecutions(): Promise<Execution[]> {
    const executions = await this.props.dynamo.send(
      new QueryCommand({
        TableName: this.props.tableName,
        KeyConditionExpression: "pk = :pk and begins_with(sk, :sk)",
        ExpressionAttributeValues: {
          ":pk": { S: ExecutionRecord.PRIMARY_KEY },
          ":sk": { S: ExecutionRecord.SORT_KEY_PREFIX },
        },
      })
    );
    return executions.Items!.map((execution) =>
      createExecutionFromResult(execution as ExecutionRecord)
    );
  }

  public async getExecution(
    executionId: string
  ): Promise<Execution | undefined> {
    const executionResult = await this.props.dynamo.send(
      new GetItemCommand({
        Key: {
          pk: { S: ExecutionRecord.PRIMARY_KEY },
          sk: { S: ExecutionRecord.sortKey(executionId) },
        },
        TableName: this.props.tableName,
      })
    );

    return executionResult.Item
      ? createExecutionFromResult(executionResult.Item as ExecutionRecord)
      : undefined;
  }
}

export interface SQSWorkflowTaskMessage {
  task: WorkflowTask;
}

export type ExecutionRecord =
  | {
      pk: { S: typeof ExecutionRecord.PRIMARY_KEY };
      sk: { S: `${typeof ExecutionRecord.SORT_KEY_PREFIX}${string}` };
      result?: AttributeValue.SMember;
      id: AttributeValue.SMember;
      status: { S: ExecutionStatus };
      startTime: AttributeValue.SMember;
      name: AttributeValue.SMember;
      workflowName: AttributeValue.SMember;
      endTime?: AttributeValue.SMember;
      error?: AttributeValue.SMember;
      message?: AttributeValue.SMember;
    } & (
      | {
          parentExecutionId: AttributeValue.SMember;
          seq: AttributeValue.NMember;
        }
      | {
          parentExecutionId?: never;
          seq?: never;
        }
    );

export const ExecutionRecord = {
  PRIMARY_KEY: "Execution",
  SORT_KEY_PREFIX: `Execution$`,
  sortKey(
    executionId: string
  ): `${typeof this.SORT_KEY_PREFIX}${typeof executionId}` {
    return `${this.SORT_KEY_PREFIX}${executionId}`;
  },
};

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
