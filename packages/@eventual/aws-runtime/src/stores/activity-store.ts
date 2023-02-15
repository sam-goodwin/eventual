import {
  AttributeValue,
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  ReturnValue,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  ActivityExecution,
  ActivityStore,
  getLazy,
  LazyValue,
} from "@eventual/core-runtime";

export interface AWSActivityStoreProps {
  activityTableName: LazyValue<string>;
  dynamo: DynamoDBClient;
}

export class AWSActivityStore implements ActivityStore {
  constructor(private props: AWSActivityStoreProps) {}

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
            pk: { S: ActivityExecutionRecord.key(executionId, seq) },
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
          TableName: getLazy(this.props.activityTableName),
          ConditionExpression: `attribute_not_exists(#claims)`,
        })
      );

      return true;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return false;
      }
      throw err;
    }
  }

  public async heartbeat(
    executionId: string,
    seq: number,
    heartbeatTime: string
  ): Promise<ActivityExecution> {
    const item = await this.props.dynamo.send(
      new UpdateItemCommand({
        Key: {
          pk: { S: ActivityExecutionRecord.key(executionId, seq) },
        },
        UpdateExpression:
          "SET heartbeatTime=:heartbeat, executionId = :executionId, seq = :seq",
        ExpressionAttributeValues: {
          ":heartbeat": { S: heartbeatTime },
          ":executionId": { S: executionId },
          ":seq": { N: `${seq}` },
        },
        TableName: getLazy(this.props.activityTableName),
        ReturnValues: ReturnValue.ALL_NEW,
      })
    );

    return createActivityFromRecord(item.Attributes as ActivityExecutionRecord);
  }

  public async cancel(executionId: string, seq: number): Promise<void> {
    await this.props.dynamo.send(
      new UpdateItemCommand({
        Key: {
          pk: { S: ActivityExecutionRecord.key(executionId, seq) },
        },
        UpdateExpression:
          "SET cancelled=:cancelled, executionId = :executionId, seq = :seq",
        ExpressionAttributeValues: {
          ":cancelled": { BOOL: true },
          ":executionId": { S: executionId },
          ":seq": { N: `${seq}` },
        },
        TableName: getLazy(this.props.activityTableName),
      })
    );
  }

  public async get(
    executionId: string,
    seq: number
  ): Promise<ActivityExecution | undefined> {
    const item = await this.props.dynamo.send(
      new GetItemCommand({
        Key: {
          pk: { S: ActivityExecutionRecord.key(executionId, seq) },
        },
        TableName: getLazy(this.props.activityTableName),
        ConsistentRead: true,
      })
    );

    return createActivityFromRecord(item.Item as ActivityExecutionRecord);
  }
}

export interface ActivityExecutionRecord
  extends Record<string, AttributeValue | undefined> {
  pk: { S: `${typeof ActivityExecutionRecord.PARTITION_KEY_PREFIX}$${string}` };
  executionId: AttributeValue.SMember;
  seq: AttributeValue.NMember;
  heartbeatTime?: AttributeValue.SMember;
  cancelled?: AttributeValue.BOOLMember;
}

export const ActivityExecutionRecord = {
  PARTITION_KEY_PREFIX: `Activity$`,
  key(executionId: string, seq: number) {
    return `${this.PARTITION_KEY_PREFIX}$${executionId}$${seq}`;
  },
};

function createActivityFromRecord(
  activityRecord: ActivityExecutionRecord
): ActivityExecution {
  return {
    executionId: activityRecord.executionId.S,
    seq: Number(activityRecord.seq.N),
    cancelled: Boolean(activityRecord.cancelled?.BOOL ?? false),
    heartbeatTime: activityRecord?.heartbeatTime?.S,
  };
}
