import {
  AttributeValue,
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ReturnValue,
  Update,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  Execution,
  ExecutionAlreadyExists,
  ExecutionID,
  ExecutionStatus,
  FailedExecution,
  FailExecutionRequest,
  InProgressExecution,
  isExecutionStatus,
  ListExecutionsRequest,
  ListExecutionsResponse,
  SucceededExecution,
  SucceedExecutionRequest,
} from "@eventual/core";
import {
  ExecutionStore,
  getLazy,
  LazyValue,
  parseExecutionId,
} from "@eventual/core-runtime";
import {
  isFailedExecutionRequest,
  WorkflowStarted,
} from "@eventual/core/internal";
import { isAwsErrorOfType, queryPageWithToken } from "../utils.js";

export interface AWSExecutionStoreProps {
  executionTableName: LazyValue<string>;
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
          TableName: getLazy(this.props.executionTableName),
          Item: {
            pk: { S: ExecutionRecord.PARTITION_KEY },
            sk: { S: ExecutionRecord.sortKey(execution.id) },
            id: { S: execution.id },
            workflowName: { S: execution.workflowName },
            status: { S: ExecutionStatus.IN_PROGRESS },
            startTime: { S: execution.startTime },
            ...(startEvent
              ? {
                  [ExecutionRecord.INSERT_EVENT]: {
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
      if (
        isAwsErrorOfType<ConditionalCheckFailedException>(
          err,
          "ConditionalCheckFailedException"
        )
      ) {
        throw new ExecutionAlreadyExists(
          parseExecutionId(execution.id).executionName,
          execution.workflowName
        );
      }
      throw err;
    }
  }

  public async update<Result = any>(
    request: FailExecutionRequest | SucceedExecutionRequest<Result>
  ): Promise<FailedExecution | SucceededExecution<Result>> {
    const commonUpdateExp: UpdateExpr = {
      set: {
        endTime: {
          formatter: (n, v) => `${n}=if_not_exists(${n}, ${v})`,
          value: { S: request.endTime },
        },
      },
      // remove the insert event if it was added
      remove: [ExecutionRecord.INSERT_EVENT],
    };

    const updateExp: UpdateExpr = isFailedExecutionRequest(request)
      ? {
          ...commonUpdateExp,
          set: {
            ...commonUpdateExp.set,
            status: { S: ExecutionStatus.FAILED },
            error: { S: request.error },
            message: { S: request.message },
          },
        }
      : {
          ...commonUpdateExp,
          set: {
            ...commonUpdateExp.set,
            status: { S: ExecutionStatus.SUCCEEDED },
            result: request.result
              ? { S: JSON.stringify(request.result) }
              : undefined,
          },
        };

    const executionRecord = await this.props.dynamo.send(
      new UpdateItemCommand({
        Key: {
          pk: { S: ExecutionRecord.PARTITION_KEY },
          sk: { S: ExecutionRecord.sortKey(request.executionId) },
        },
        TableName: getLazy(this.props.executionTableName),
        ReturnValues: "ALL_NEW",
        ...formatUpdateExpr(updateExp),
      })
    );

    return createExecutionFromResult(
      executionRecord.Attributes as ExecutionRecord
    ) as FailedExecution | SucceededExecution<Result>;
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
        TableName: getLazy(this.props.executionTableName),
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
        TableName: getLazy(this.props.executionTableName),
        IndexName: ExecutionRecord.START_TIME_SORTED_INDEX,
        KeyConditionExpression: "#pk = :pk",
        ScanIndexForward: request?.sortDirection !== "DESC",
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
  // support for single table patterns if needed for expansion.
  PARTITION_KEY: "Execution",
  // main execution record will be $[executionId]
  SORT_KEY_PREFIX: `$`,
  START_TIME_SORTED_INDEX: "startTime-order",
  START_TIME: "startTime",
  INSERT_EVENT: "insertEvent",
  sortKey(
    executionId: string
  ): `${typeof this.SORT_KEY_PREFIX}${typeof executionId}` {
    return `${this.SORT_KEY_PREFIX}${executionId}`;
  },
};

function createExecutionFromResult(execution: ExecutionRecord): Execution {
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

interface UpdateExpr {
  set: Record<
    string,
    | AttributeValue
    | undefined
    | {
        formatter: (nameKey: string, valueKey: string) => string;
        value: AttributeValue;
      }
  >;
  remove?: string[];
}

function formatUpdateExpr(
  expr: UpdateExpr
): Pick<
  Update,
  "UpdateExpression" | "ExpressionAttributeNames" | "ExpressionAttributeValues"
> {
  const names: Record<string, string> = {};
  const values: Record<string, AttributeValue> = {};
  const remove = expr.remove
    ? `REMOVE ${[...new Set(expr.remove)]
        .map((name) => {
          names[`#${name}`] = name;
          return `#${name}`;
        })
        .join(",")}`
    : "";
  const set = `SET ${Object.entries(expr.set)
    .filter(
      (entry): entry is [string, Exclude<(typeof entry)[1], undefined>] =>
        entry[1] !== undefined
    )
    .map(([name, value]) => {
      const n = `#${name}`;
      const v = `:${name}`;

      const [formatted, _value] =
        "formatter" in value
          ? [value.formatter(n, v), value.value]
          : [`${n}=${v}`, value];

      names[n] = name;
      values[v] = _value;

      return formatted;
    })
    .join(",")}`;

  return {
    UpdateExpression: [remove, set].join(" "),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}
