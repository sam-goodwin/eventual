import {
  AttributeValue,
  BatchWriteItemCommand,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { WorkflowEvent } from "@eventual/core";
import { ulid } from "ulid";

export interface ExecutionHistoryClientProps {
  readonly dynamo: DynamoDBClient;
  readonly tableName: string;
}

type UnresolvedEvent<T extends WorkflowEvent> = Omit<T, "id" | "timestamp">;

export class ExecutionHistoryClient {
  constructor(private props: ExecutionHistoryClientProps) {}

  public async createAndPutEvent<T extends WorkflowEvent>(
    executionId: string,
    event: UnresolvedEvent<T>,
    time?: Date
  ): Promise<T> {
    const resolvedEvent = createEvent(event, time);

    await this.putEvent(executionId, resolvedEvent);

    return resolvedEvent;
  }

  public async putEvent<T extends WorkflowEvent>(
    executionId: string,
    event: T
  ): Promise<void> {
    await this.props.dynamo.send(
      new PutItemCommand({
        Item: createEventRecord(executionId, event),
        TableName: this.props.tableName,
      })
    );
  }

  /**
   * Writes events as a batch into the history table, assigning IDs and timestamp first.
   */
  public async createAndPutEvents(
    executionId: string,
    events: UnresolvedEvent<WorkflowEvent>[],
    time?: Date
  ): Promise<WorkflowEvent[]> {
    const resolvedEvents = events.map((e) => createEvent(e, time));

    await this.putEvents(executionId, resolvedEvents);

    return resolvedEvents;
  }

  /**
   * Writes events as a batch into the execution history table.
   */
  public async putEvents(
    executionId: string,
    events: WorkflowEvent[]
  ): Promise<void> {
    // TODO: partition the batches
    await this.props.dynamo.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [this.props.tableName]: events.map((event) => ({
            PutRequest: {
              Item: createEventRecord(executionId, event),
            },
          })),
        },
      })
    );
  }

  /**
   * Read an execution's events from the execution history table table
   */
  public async getEvents(executionId: string): Promise<WorkflowEvent[]> {
    console.log(executionId);
    const output = await this.props.dynamo.send(
      new QueryCommand({
        TableName: this.props.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with ( sk, :sk )",
        ExpressionAttributeValues: {
          ":pk": { S: EventRecord.PRIMARY_KEY },
          ":sk": { S: EventRecord.sortKey(executionId, "") },
        },
      })
    );
    return output.Items!.map((item) => JSON.parse(item.event!.S!));
  }
}

export function createEvent<T extends WorkflowEvent>(
  event: UnresolvedEvent<T>,
  time: Date = new Date()
): T {
  const uuid = ulid();
  const timestamp = time.toISOString();

  return { ...event, id: uuid, timestamp } as T;
}

interface EventRecord {
  pk: { S: typeof EventRecord.PRIMARY_KEY };
  sk: { S: `${typeof EventRecord.SORT_KEY_PREFIX}${string}$${string}` };
  event: AttributeValue.SMember;
  id: AttributeValue.SMember;
  executionId: AttributeValue.SMember;
  time: AttributeValue.SMember;
}

namespace EventRecord {
  export const PRIMARY_KEY = "ExecutionHistory";
  export const SORT_KEY_PREFIX = `Event$`;
  export function sortKey(
    executionId: string,
    id: string
  ): EventRecord["sk"]["S"] {
    return `${SORT_KEY_PREFIX}${executionId}$${id}`;
  }
}

function createEventRecord(
  executionId: string,
  workflowEvent: WorkflowEvent
): EventRecord {
  return {
    pk: { S: EventRecord.PRIMARY_KEY },
    sk: { S: EventRecord.sortKey(executionId, workflowEvent.id) },
    id: { S: workflowEvent.id },
    executionId: { S: executionId },
    event: { S: JSON.stringify(workflowEvent) },
    time: { S: workflowEvent.timestamp },
  };
}
