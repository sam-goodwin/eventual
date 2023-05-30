import {
  AttributeValue,
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  ReturnValue,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  LazyValue,
  TaskExecution,
  TaskStore,
  getLazy,
} from "@eventual/core-runtime";
import { isAwsErrorOfType } from "../utils.js";

export interface AWSTaskStoreProps {
  taskTableName: LazyValue<string>;
  dynamo: DynamoDBClient;
}

export class AWSTaskStore implements TaskStore {
  constructor(private props: AWSTaskStoreProps) {}

  public async claim(
    executionId: string,
    seq: number,
    retry: number,
    claimer?: string | undefined
  ): Promise<boolean> {
    try {
      await this.props.dynamo.send(
        new UpdateItemCommand({
          Key: {
            pk: { S: TaskExecutionRecord.key(executionId, seq) },
          },
          UpdateExpression: `SET #claims = :claim, executionId = :executionId, seq = :seq`,
          // Update a new property for each retry.
          ExpressionAttributeNames: {
            "#claims": `claims_${retry}`,
          },
          ExpressionAttributeValues: {
            ":claim": { S: claimer ?? "Unknown" },
            ":executionId": { S: executionId },
            ":seq": { N: `${seq}` },
          },
          TableName: getLazy(this.props.taskTableName),
          ConditionExpression: `attribute_not_exists(#claims)`,
        })
      );

      return true;
    } catch (err) {
      if (
        isAwsErrorOfType<ConditionalCheckFailedException>(
          err,
          "ConditionalCheckFailedException"
        )
      ) {
        return false;
      }
      throw err;
    }
  }

  public async heartbeat(
    executionId: string,
    seq: number,
    heartbeatTime: string
  ): Promise<TaskExecution> {
    const item = await this.props.dynamo.send(
      new UpdateItemCommand({
        Key: {
          pk: { S: TaskExecutionRecord.key(executionId, seq) },
        },
        UpdateExpression:
          "SET heartbeatTime=:heartbeat, executionId = :executionId, seq = :seq",
        ExpressionAttributeValues: {
          ":heartbeat": { S: heartbeatTime },
          ":executionId": { S: executionId },
          ":seq": { N: `${seq}` },
        },
        TableName: getLazy(this.props.taskTableName),
        ReturnValues: ReturnValue.ALL_NEW,
      })
    );

    return createTaskFromRecord(item.Attributes as TaskExecutionRecord);
  }

  public async cancel(executionId: string, seq: number): Promise<void> {
    await this.props.dynamo.send(
      new UpdateItemCommand({
        Key: {
          pk: { S: TaskExecutionRecord.key(executionId, seq) },
        },
        UpdateExpression:
          "SET cancelled=:cancelled, executionId = :executionId, seq = :seq",
        ExpressionAttributeValues: {
          ":cancelled": { BOOL: true },
          ":executionId": { S: executionId },
          ":seq": { N: `${seq}` },
        },
        TableName: getLazy(this.props.taskTableName),
      })
    );
  }

  public async get(
    executionId: string,
    seq: number
  ): Promise<TaskExecution | undefined> {
    const item = await this.props.dynamo.send(
      new GetItemCommand({
        Key: {
          pk: { S: TaskExecutionRecord.key(executionId, seq) },
        },
        TableName: getLazy(this.props.taskTableName),
        ConsistentRead: true,
      })
    );

    return createTaskFromRecord(item.Item as TaskExecutionRecord);
  }
}

export interface TaskExecutionRecord
  extends Record<string, AttributeValue | undefined> {
  pk: { S: `${typeof TaskExecutionRecord.PARTITION_KEY_PREFIX}$${string}` };
  executionId: AttributeValue.SMember;
  seq: AttributeValue.NMember;
  heartbeatTime?: AttributeValue.SMember;
  cancelled?: AttributeValue.BOOLMember;
}

export const TaskExecutionRecord = {
  PARTITION_KEY_PREFIX: `Task$`,
  key(executionId: string, seq: number) {
    return `${this.PARTITION_KEY_PREFIX}$${executionId}$${seq}`;
  },
};

function createTaskFromRecord(taskRecord: TaskExecutionRecord): TaskExecution {
  return {
    executionId: taskRecord.executionId.S,
    seq: Number(taskRecord.seq.N),
    cancelled: Boolean(taskRecord.cancelled?.BOOL ?? false),
    heartbeatTime: taskRecord?.heartbeatTime?.S,
  };
}
