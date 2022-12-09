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
            reference: { S: claimer ?? "Unknown" },
          },
          UpdateExpression: "SET #claim[:retry]=:claim",
          // Update a new property for each retry.
          ExpressionAttributeNames: {
            "#claim": `claim`,
          },
          ExpressionAttributeValues: {
            ":retry": { N: `${retry}` },
            ":claim": { S: claimer ?? "Unknown" },
          },
          TableName: this.props.activityTableName,
          ConditionExpression: "attribute_not_exists(#claims[:retry])",
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
        UpdateExpression: "SET heartbeat=:heartbeat",
        ExpressionAttributeValues: {
          ":heartbeat": { S: heartbeatTime },
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
        UpdateExpression: "SET cancelled=:cancelled",
        ExpressionAttributeValues: {
          ":cancelled": { BOOL: true },
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
      })
    );

    return createActivityFromRecord(item.Item as ActivityExecutionRecord);
  }
}

export interface ActivityExecutionRecord {
  pk: { S: `${typeof ActivityExecutionRecord.PARTITION_KEY_PREFIX}$${string}` };
  executionId: AttributeValue.SMember;
  seq: AttributeValue.NMember;
  claims?: AttributeValue.LMember;
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
    claims: activityRecord.claims?.L.map((s) => s.S ?? "Unknown"),
    heartbeatTime: activityRecord?.heartbeatTime?.S,
  };
}
