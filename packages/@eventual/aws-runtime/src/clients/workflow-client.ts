import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
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
  formatExecutionId,
  createEvent,
  GetExecutionsResponse,
  GetExecutionsRequest,
  StartExecutionRequest,
  StartChildExecutionRequest,
} from "@eventual/core";
import { ulid } from "ulidx";
import { AWSActivityRuntimeClient } from "./activity-runtime-client.js";
import { queryPageWithToken } from "./utils.js";

export interface AWSWorkflowClientProps {
  readonly dynamo: DynamoDBClient;
  readonly tableName: string;
  readonly sqs: SQSClient;
  readonly workflowQueueUrl: string;
  readonly activityRuntimeClient: AWSActivityRuntimeClient;
}

export class AWSWorkflowClient extends WorkflowClient {
  constructor(private props: AWSWorkflowClientProps) {
    super(props.activityRuntimeClient, () => new Date());
  }

  /**
   * Start a workflow execution
   * @param name Suffix of execution id
   * @param input Workflow parameters
   * @returns
   */
  public async startExecution<W extends Workflow = Workflow>({
    executionName = ulid(),
    workflow,
    input,
    timeoutSeconds,
    ...request
  }: StartExecutionRequest<W> | StartChildExecutionRequest<W>) {
    const workflowName =
      typeof workflow === "string" ? workflow : workflow.workflowName;
    const executionId = formatExecutionId(workflowName, executionName);
    console.log("execution input:", input);

    await this.props.dynamo.send(
      new PutItemCommand({
        TableName: this.props.tableName,
        Item: {
          pk: { S: ExecutionRecord.PARTITION_KEY },
          sk: { S: ExecutionRecord.sortKey(executionId) },
          id: { S: executionId },
          name: { S: executionName },
          workflowName: { S: workflowName },
          status: { S: ExecutionStatus.IN_PROGRESS },
          startTime: { S: new Date().toISOString() },
          ...("parentExecutionId" in request
            ? {
                parentExecutionId: { S: request.parentExecutionId },
                seq: { N: request.seq.toString(10) },
              }
            : {}),
        },
      })
    );

    const workflowStartedEvent = createEvent<WorkflowStarted>(
      {
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
          parentId:
            "parentExecutionId" in request
              ? request.parentExecutionId
              : undefined,
        },
      },
      new Date()
    );

    await this.submitWorkflowTask(executionId, workflowStartedEvent);

    return { executionId };
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

  public async getExecutions(
    request?: GetExecutionsRequest
  ): Promise<GetExecutionsResponse> {
    const filters = [
      request?.statuses
        ? `#status IN (${request.statuses
            // for safety, filter out execution statuses that are unknown
            .filter((s) => Object.values(ExecutionStatus).includes(s))
            .map((s) => `"${s}"`)
            .join(",")})`
        : undefined,
      request?.workflowName ? `workflowName=:workflowName` : undefined,
    ]
      .filter((f) => !!f)
      .join(" AND ");

    const result = await queryPageWithToken<ExecutionRecord>(
      {
        dynamoClient: this.props.dynamo,
        pageSize: request?.maxResults ?? 100,
        keys: ["pk", "sk"],
        nextToken: request?.nextToken,
      },
      {
        TableName: this.props.tableName,
        KeyConditionExpression: "pk = :pk and begins_with(#sk, :sk)",
        ScanIndexForward: request?.sortDirection !== "Desc",
        FilterExpression: filters || undefined,
        ExpressionAttributeValues: {
          ":pk": { S: ExecutionRecord.PARTITION_KEY },
          ":sk": { S: ExecutionRecord.SORT_KEY_PREFIX },
          ...(request?.workflowName
            ? { ":workflowName": { S: request?.workflowName } }
            : {}),
        },
        ExpressionAttributeNames: {
          "#sk": "sk",
          ...(request?.statuses ? { "#status": "status" } : undefined),
        },
      }
    );

    const executions = result.records.map((execution) =>
      createExecutionFromResult(execution as ExecutionRecord)
    );

    return {
      executions,
      nextToken: result.nextToken,
    };
  }

  public async getExecution(
    executionId: string
  ): Promise<Execution | undefined> {
    const executionResult = await this.props.dynamo.send(
      new GetItemCommand({
        Key: {
          pk: { S: ExecutionRecord.PARTITION_KEY },
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
      pk: { S: typeof ExecutionRecord.PARTITION_KEY };
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
  PARTITION_KEY: "Execution",
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
    endTime: execution.endTime?.S as string,
    error: execution.error?.S as string,
    message: execution.message?.S as string,
    result: execution.result ? JSON.parse(execution.result.S) : undefined,
    startTime: execution.startTime.S,
    status: execution.status.S,
    workflowName: execution.workflowName.S,
    parent:
      execution.parentExecutionId !== undefined && execution.seq !== undefined
        ? {
            executionId: execution.parentExecutionId.S,
            seq: parseInt(execution.seq.N, 10),
          }
        : undefined,
  };
}
