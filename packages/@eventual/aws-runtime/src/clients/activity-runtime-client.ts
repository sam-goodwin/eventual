import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { Command } from "@eventual/core";

export interface ActivityRuntimeClientProps {
  dynamo: DynamoDBClient;
  activityLockTableName: string;
}

export class ActivityRuntimeClient {
  constructor(private props: ActivityRuntimeClientProps) {}

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
    command: Command,
    retry: number,
    claimer?: string
  ) {
    try {
      await this.props.dynamo.send(
        new PutItemCommand({
          Item: {
            pk: { S: ActivityLockRecord.key(executionId, command, retry) },
            reference: { S: claimer ?? "Unknown" },
          },
          TableName: this.props.activityLockTableName,
          ConditionExpression: "attribute_not_exists(pk)",
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
}

export interface ActivityLockRecord {
  pk: `${typeof ActivityLockRecord.PARTITION_KEY_PREFIX}$${string}`;
  claimer: string;
}

export namespace ActivityLockRecord {
  export const PARTITION_KEY_PREFIX = `Activity$`;
  export function key(executionId: string, command: Command, retry: number) {
    return `${PARTITION_KEY_PREFIX}$${executionId}$${command.seq}${retry}`;
  }
}
