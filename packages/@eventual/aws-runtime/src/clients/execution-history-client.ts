import {
  AttributeValue,
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

/**
 * An event that has not been assigned a timestamp or unique ID yet.
 */
type UnresolvedEvent<T extends WorkflowEvent> = Omit<T, "id" | "timestamp">;

export class ExecutionHistoryClient {
  constructor(private props: ExecutionHistoryClientProps) {}

  public async createAndPutEvent<T extends WorkflowEvent>(
    executionId: string,
    event: UnresolvedEvent<T>
  ): Promise<T> {
    const resolvedEvent = createEvent(event);

    await this.props.dynamo.send(
      new PutItemCommand({
        Item: createEventRecord(executionId, resolvedEvent),
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
    events: UnresolvedEvent<WorkflowEvent>[]
  ): Promise<WorkflowEvent[]> {
    const resolvedEvents = events.map(createEvent);

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
}

export function createEvent<T extends WorkflowEvent>(
  event: UnresolvedEvent<T>
): T {
  const uuid = ulid();
  const timestamp = new Date().toISOString();

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
