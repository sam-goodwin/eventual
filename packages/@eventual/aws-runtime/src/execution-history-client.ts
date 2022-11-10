import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { Event } from "@eventual/core";
import { ulid } from "ulid";

export interface ExecutionHistoryClientProps {
  readonly dynamo: DynamoDBClient;
  readonly tableName: string;
}

export class ExecutionHistoryClient {
  constructor(private props: ExecutionHistoryClientProps) {}

  async putEvent<T extends Event>(
    executionId: string,
    event: Omit<T, "id" | "timestamp">
  ): Promise<T> {
    const uuid = ulid();
    const timestamp = new Date().toISOString();

    await this.props.dynamo.send(
      new PutItemCommand({
        Item: {
          pk: { S: "ExecutionHistory" },
          sk: { S: `Event$${executionId}$${uuid}` },
          id: { S: uuid },
          executionId: { S: executionId },
          event: { S: JSON.stringify(event) },
          time: { S: timestamp },
        },
        TableName: this.props.tableName,
      })
    );

    return { ...event, id: uuid } as T;
  }
}
