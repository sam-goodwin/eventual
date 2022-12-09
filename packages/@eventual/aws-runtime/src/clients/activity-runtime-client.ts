import {
  AttributeValue,
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  ReturnValue,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import type { ActivityExecution, ActivityRuntimeClient } from "@eventual/core";

export interface AWSActivityRuntimeClientProps {
  dynamo: DynamoDBClient;
  activityTableName: string;
}

export class AWSActivityRuntimeClient implements ActivityRuntimeClient {
  constructor(private props: AWSActivityRuntimeClientProps) {}

  /**
   * Claims a activity for an actor.
   *
   * Future invocations of the same executionId + future.seq + retry will fail.
   *
   * @param claimer optional string to correlate the lock to the claimer.
   * @return a boolean determining if the claim was granted to the current actor.
   **/
  async requestExecutionActivityClaim(
    executionId: string,
    seq: number,
    retry: number,
    claimer?: string
  ) {
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
          TableName: this.props.activityTableName,
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

  /*
   * Heartbeat an activity.
   **/
  async heartbeatActivity(
    executionId: string,
    seq: number,
    heartbeatTime: string
  ): Promise<{ cancelled: boolean }> {
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
        TableName: this.props.activityTableName,
        ReturnValues: ReturnValue.ALL_NEW,
      })
    );

    return {
      cancelled:
        (item.Attributes as ActivityExecutionRecord).cancelled?.BOOL ?? false,
    };
  }

  async cancelActivity(executionId: string, seq: number) {
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
        TableName: this.props.activityTableName,
      })
    );
  }

  async getActivity(
    executionId: string,
    seq: number
  ): Promise<ActivityExecution | undefined> {
    const item = await this.props.dynamo.send(
      new GetItemCommand({
        Key: {
          pk: { S: ActivityExecutionRecord.key(executionId, seq) },
        },
        TableName: this.props.activityTableName,
        ConsistentRead: true,
      })
    );

    return createActivityFromRecord(item.Item as ActivityExecutionRecord);
  }
}

export interface ActivityExecutionRecord {
  pk: { S: `${typeof ActivityExecutionRecord.PARTITION_KEY_PREFIX}$${string}` };
  executionId: AttributeValue.SMember;
  seq: AttributeValue.NMember;
  heartbeatTime?: AttributeValue.SMember;
  cancelled?: AttributeValue.BOOLMember;
}

export namespace ActivityExecutionRecord {
  export const PARTITION_KEY_PREFIX = `Activity$`;
  export function key(executionId: string, seq: number) {
    return `${PARTITION_KEY_PREFIX}$${executionId}$${seq}`;
  }
}

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
