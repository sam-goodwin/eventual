import {
  AttributeValue,
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ReturnValue,
} from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  ActivityRuntimeClient,
  Execution,
  ExecutionStatus,
  HistoryStateEvent,
  LogsClient,
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
  lookupWorkflow,
  SortOrder,
  isExecutionStatus,
  computeScheduleDate,
  StartExecutionResponse,
  hashCode,
} from "@eventual/core";
import { ulid } from "ulidx";
import { inspect } from "util";
import { queryPageWithToken } from "./utils.js";

export interface AWSWorkflowClientProps {
  readonly dynamo: DynamoDBClient;
  readonly tableName: string;
  readonly sqs: SQSClient;
  readonly workflowQueueUrl: string;
  readonly activityRuntimeClient: ActivityRuntimeClient;
  readonly logsClient: LogsClient;
}

export class AWSWorkflowClient extends WorkflowClient {
  constructor(private props: AWSWorkflowClientProps) {
    super(props.activityRuntimeClient, () => new Date());
  }

  /**
   * Start a workflow execution
   *
   * NOTE: the service entry point is required to access {@link workflows()}.
   *
   * @param name Suffix of execution id
   * @param input Workflow parameters
   */
  public async startExecution<W extends Workflow = Workflow>({
    executionName = ulid(),
    workflow,
    input,
    timeout,
    ...request
  }:
    | StartExecutionRequest<W>
    | StartChildExecutionRequest<W>): Promise<StartExecutionResponse> {
    if (typeof workflow === "string" && !lookupWorkflow(workflow)) {
      throw new Error(`Workflow ${workflow} does not exist in the service.`);
    }

    const workflowName =
      typeof workflow === "string" ? workflow : workflow.workflowName;
    const executionId = formatExecutionId(workflowName, executionName);
    const inputHash =
      input !== undefined
        ? hashCode(JSON.stringify(input)).toString(16)
        : undefined;
    console.log("execution input:", input);
    console.log("execution input hash:", inputHash);

    try {
      try {
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
              ...(inputHash !== undefined
                ? { inputHash: { S: inputHash } }
                : {}),
              ...("parentExecutionId" in request
                ? {
                    parentExecutionId: { S: request.parentExecutionId },
                    seq: { N: request.seq.toString(10) },
                  }
                : {}),
            },
            ConditionExpression: "attribute_not_exists(sk)",
            ReturnValues: ReturnValue.ALL_OLD,
          })
        );
      } catch (err) {
        // execution name already exists for the workflow. Check to see if the execution
        if (err instanceof ConditionalCheckFailedException) {
          const execution = await this.getExecution(executionId);
          if (execution?.inputHash === inputHash) {
            return { executionId, alreadyRunning: true };
          } else {
            throw new Error(
              `Execution name ${executionName} already exists for workflow ${workflowName} with different inputs.`
            );
          }
        }
        throw err;
      }

      await this.props.logsClient.initializeExecutionLog(executionId);
      await this.props.logsClient.putExecutionLogs(executionId, {
        time: new Date().getTime(),
        message: "Workflow Started",
      });

      const workflowStartedEvent = createEvent<WorkflowStarted>(
        {
          type: WorkflowEventType.WorkflowStarted,
          input,
          workflowName,
          // generate the time for the workflow to timeout based on when it was started.
          // the timer will be started by the orchestrator so the client does not need to have access to the timer client.
          timeoutTime: timeout
            ? computeScheduleDate(timeout, this.baseTime()).toISOString()
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

      return { executionId, alreadyRunning: false };
    } catch (err) {
      console.log(err);
      throw new Error(
        "Something went wrong starting a workflow: " + inspect(err)
      );
    }
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
      request?.statuses ? `contains(:statuses, #status)` : undefined,
      request?.workflowName ? `workflowName=:workflowName` : undefined,
    ]
      .filter((f) => !!f)
      .join(" AND ");

    const result = await queryPageWithToken<ExecutionRecord>(
      {
        dynamoClient: this.props.dynamo,
        pageSize: request?.maxResults ?? 100,
        // must take all keys from both LSI and GSI
        keys: ["pk", "startTime", "sk"],
        nextToken: request?.nextToken,
      },
      {
        TableName: this.props.tableName,
        IndexName: ExecutionRecord.START_TIME_SORTED_INDEX,
        KeyConditionExpression: "#pk = :pk",
        ScanIndexForward: request?.sortDirection !== SortOrder.Desc,
        FilterExpression: filters || undefined,
        ExpressionAttributeValues: {
          ":pk": { S: ExecutionRecord.PARTITION_KEY },
          ...(request?.workflowName
            ? { ":workflowName": { S: request?.workflowName } }
            : {}),
          ...(request?.statuses
            ? {
                ":statuses": {
                  L: request.statuses
                    // for safety, filter out execution statuses that are unknown
                    .filter(isExecutionStatus)
                    .map((s) => ({ S: s })),
                },
              }
            : {}),
        },
        ExpressionAttributeNames: {
          "#pk": "pk",
          ...(request?.statuses ? { "#status": "status" } : undefined),
        },
        ConsistentRead: true,
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
      inputHash?: AttributeValue.NMember;
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
  START_TIME_SORTED_INDEX: "startTime-order",
  START_TIME: "startTime",
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
    inputHash: execution.inputHash?.S,
    parent:
      execution.parentExecutionId !== undefined && execution.seq !== undefined
        ? {
            executionId: execution.parentExecutionId.S,
            seq: parseInt(execution.seq.N, 10),
          }
        : undefined,
  };
}
