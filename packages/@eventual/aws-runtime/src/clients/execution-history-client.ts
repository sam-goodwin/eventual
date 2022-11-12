import {
  BatchWriteItemCommand,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { WorkflowEvent } from "@eventual/core";
import { ulid } from "ulid";

export interface ExecutionHistoryClientProps {
  readonly dynamo: DynamoDBClient;
  readonly tableName: string;
}

export class ExecutionHistoryClient {
  constructor(private props: ExecutionHistoryClientProps) {}

  public async createAndPutEvent<T extends WorkflowEvent>(
    executionId: string,
    event: Omit<T, "id" | "timestamp">
  ): Promise<T> {
    const resolvedEvent = createEvent(event);

    await this.props.dynamo.send(
      new PutItemCommand({
        Item: {
          pk: { S: EventRecord.PRIMARY_KEY },
          sk: { S: EventRecord.sortKey(executionId, resolvedEvent.id) },
          id: { S: resolvedEvent.id },
          executionId: { S: executionId },
          event: { S: JSON.stringify(event) },
          time: { S: resolvedEvent.id },
        },
        TableName: this.props.tableName,
      })
    );

    return resolvedEvent;
  }

  /**
   * Writes events as a batch into the history table, assigning IDs and timestamp first.
   */
  public async createAndPutEvents(
    executionId: string,
    events: Omit<WorkflowEvent, "id" | "timestamp">[]
  ): Promise<WorkflowEvent[]> {
    const resolvedEvents = events.map(createEvent);

    await this.putEvents(executionId, resolvedEvents);

    return resolvedEvents;
  }

  /**
   * Writes events as a batch into the execution history table.
   */
  public async putEvents(executionId: string, events: WorkflowEvent[]): Promise<void> {
    // TODO: partition the batches
    await this.props.dynamo.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [this.props.tableName]: events.map((event) => ({
            PutRequest: {
              Item: {
                pk: { S: EventRecord.PRIMARY_KEY },
                sk: { S: EventRecord.sortKey(executionId, event.id) },
                id: { S: event.id },
                executionId: { S: executionId },
                event: { S: JSON.stringify(event) },
                time: { S: event.timestamp },
              },
            },
          })),
        },
      })
    );
  }
}

export interface EventRecord extends Omit<WorkflowEvent, "result"> {
  pk: typeof EventRecord.PRIMARY_KEY;
  sk: `${typeof EventRecord.SORT_KEY_PREFIX}${string}$${string}`;
  result: string;
}

export namespace EventRecord {
  export const PRIMARY_KEY = "ExecutionHistory";
  export const SORT_KEY_PREFIX = `Event$`;
  export function sortKey(executionId: string, id: string) {
    return `${SORT_KEY_PREFIX}${executionId}$${id}`;
  }
}

export function createEvent<T extends WorkflowEvent>(
  event: Omit<T, "id" | "timestamp">
): T {
  const uuid = ulid();
  const timestamp = new Date().toISOString();

  return { ...event, id: uuid, timestamp } as T;
}
