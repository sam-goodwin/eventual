import {
  AttributeValue,
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ReturnValue,
  TransactWriteItemsCommand,
  Update,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  Execution,
  ExecutionAlreadyExists,
  ExecutionID,
  ExecutionStatus,
  FailExecutionRequest,
  getEventId,
  InProgressExecution,
  isExecutionStatus,
  isFailedExecutionRequest,
  ListExecutionsRequest,
  ListExecutionsResponse,
  parseExecutionId,
  SortOrder,
  SucceedExecutionRequest,
  WorkflowStarted,
} from "@eventual/core";
import {
  ExecutionStore,
  getLazy,
  LazyValue,
  UpdateEvent,
} from "@eventual/runtime-core";
import { queryPageWithToken } from "../utils.js";

export interface AWSExecutionStoreProps {
  tableName: LazyValue<string>;
  dynamo: DynamoDBClient;
}

export class AWSExecutionStore implements ExecutionStore {
  constructor(private props: AWSExecutionStoreProps) {}

  /**
   * Creates a new execution record, failing if the execution already exist.
   *
   * If the execution already exists, throws {@link ExecutionAlreadyExists}.
   *
   * Note: This methods does not do other things needed to start a workflow,
   *       only creates the database record.
   * @see EventualServiceClient.startExecution
   * @override
   */
  public async create(
    execution: InProgressExecution,
    startEvent?: WorkflowStarted
  ): Promise<void> {
    try {
      await this.props.dynamo.send(
        new PutItemCommand({
          TableName: getLazy(this.props.tableName),
          Item: {
            pk: { S: ExecutionRecord.PARTITION_KEY },
            sk: { S: ExecutionRecord.sortKey(execution.id) },
            id: { S: execution.id },
            workflowName: { S: execution.workflowName },
            status: { S: ExecutionStatus.IN_PROGRESS },
            startTime: { S: execution.startTime },
            ...(startEvent
              ? {
                  [ExecutionInsertEventRecord.INSERT_EVENT]: {
                    S: JSON.stringify(startEvent),
                  },
                }
              : {}),
            ...(execution.inputHash !== undefined
              ? { inputHash: { S: execution.inputHash } }
              : {}),
            ...(execution.parent
              ? {
                  parentExecutionId: { S: execution.parent.executionId },
                  seq: { N: execution.parent.seq.toString(10) },
                }
              : {}),
          },
          ConditionExpression: "attribute_not_exists(sk)",
          ReturnValues: ReturnValue.ALL_OLD,
        })
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new ExecutionAlreadyExists(
          parseExecutionId(execution.id).executionName,
          execution.workflowName
        );
      }
      throw err;
    }
  }

  public async update<Result = any>(
    request: FailExecutionRequest | SucceedExecutionRequest<Result>,
    updateEvent?: UpdateEvent
  ): Promise<void> {
    const update: Update = isFailedExecutionRequest(request)
      ? {
          Key: {
            pk: { S: ExecutionRecord.PARTITION_KEY },
            sk: { S: ExecutionRecord.sortKey(request.executionId) },
          },
          TableName: getLazy(this.props.tableName),
          UpdateExpression:
            "SET #status=:failed, #error=:error, #message=:message, endTime=if_not_exists(endTime,:endTime)",
          ExpressionAttributeNames: {
            "#status": "status",
            "#error": "error",
            "#message": "message",
          },
          ExpressionAttributeValues: {
            ":failed": { S: ExecutionStatus.FAILED },
            ":endTime": { S: request.endTime },
            ":error": { S: request.error },
            ":message": { S: request.message },
          },
        }
      : {
          Key: {
            pk: { S: ExecutionRecord.PARTITION_KEY },
            sk: { S: ExecutionRecord.sortKey(request.executionId) },
          },
          TableName: getLazy(this.props.tableName),
          UpdateExpression: request.result
            ? "SET #status=:complete, #result=:result, endTime=if_not_exists(endTime,:endTime)"
            : "SET #status=:complete, endTime=if_not_exists(endTime,:endTime)",
          ExpressionAttributeNames: {
            "#status": "status",
            ...(request.result ? { "#result": "result" } : {}),
          },
          ExpressionAttributeValues: {
            ":complete": { S: ExecutionStatus.SUCCEEDED },
            ":endTime": { S: request.endTime },
            ...(request.result
              ? { ":result": { S: JSON.stringify(request.result) } }
              : {}),
          },
        };

    if (updateEvent) {
      await this.props.dynamo.send(
        new TransactWriteItemsCommand({
          TransactItems: [
            { Update: update },
            {
              Put: {
                TableName: getLazy(this.props.tableName),
                Item: {
                  pk: { S: ExecutionInsertEventRecord.PARTITION_KEY },
                  sk: {
                    S: ExecutionInsertEventRecord.sortKey(
                      updateEvent.executionId + getEventId(updateEvent.event)
                    ),
                  },
                  id: { S: updateEvent.executionId },
                  insertEvent: { S: JSON.stringify(updateEvent.event) },
                  ttl: { N: (new Date().getTime() + 10000).toString() },
                } satisfies ExecutionUpdateEventRecord,
              },
            },
          ],
        })
      );
    } else {
      await this.props.dynamo.send(new UpdateItemCommand(update));
    }
  }

  public async get<Result = any>(
    executionId: string
  ): Promise<Execution<Result> | undefined> {
    const executionResult = await this.props.dynamo.send(
      new GetItemCommand({
        Key: {
          pk: { S: ExecutionRecord.PARTITION_KEY },
          sk: { S: ExecutionRecord.sortKey(executionId) },
        },
        TableName: getLazy(this.props.tableName),
        ConsistentRead: true,
      })
    );

    return executionResult.Item
      ? createExecutionFromResult(executionResult.Item as ExecutionRecord)
      : undefined;
  }

  public async list(
    request: ListExecutionsRequest
  ): Promise<ListExecutionsResponse> {
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
        TableName: getLazy(this.props.tableName),
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
}

export type ExecutionRecord =
  | {
      pk: { S: typeof ExecutionRecord.PARTITION_KEY };
      sk: { S: `${typeof ExecutionRecord.SORT_KEY_PREFIX}${string}` };
      result?: AttributeValue.SMember;
      id: { S: ExecutionID };
      status: { S: ExecutionStatus };
      startTime: AttributeValue.SMember;
      name: AttributeValue.SMember;
      workflowName: AttributeValue.SMember;
      endTime?: AttributeValue.SMember;
      error?: AttributeValue.SMember;
      message?: AttributeValue.SMember;
      inputHash?: AttributeValue.SMember;
      /**
       * When provided, a the event will be emitted to the workflow queue after the execution is created.
       */
      insertEvent?: AttributeValue.SMember;
    } & (
      | {
          parentExecutionId: { S: ExecutionID };
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
  INSERT_EVENT: "insertEvent",
  sortKey(
    executionId: string
  ): `${typeof this.SORT_KEY_PREFIX}${typeof executionId}` {
    return `${this.SORT_KEY_PREFIX}${executionId}`;
  },
};

/**
 * A temporary dynamo entry used to transactionally send an event
 * with an update to an execution.
 */
export interface ExecutionUpdateEventRecord {
  pk: { S: typeof ExecutionInsertEventRecord.PARTITION_KEY };
  sk: {
    S: `${typeof ExecutionInsertEventRecord.SORT_KEY_PREFIX}${string}`;
  };
  id: { S: ExecutionID };
  /**
   * The event to emit on a successfully writing this item.
   */
  insertEvent: AttributeValue.SMember;
  ttl: AttributeValue.NMember;
}

export const ExecutionInsertEventRecord = {
  PARTITION_KEY: "ExecutionInsertEvent",
  SORT_KEY_PREFIX: `InsertEvent$`,
  INSERT_EVENT: "insertEvent",
  sortKey(id: string): `${typeof this.SORT_KEY_PREFIX}${typeof id}` {
    return `${this.SORT_KEY_PREFIX}${id}`;
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
