import {
  AttributeValue,
  BatchWriteItemCommand,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import {
  BaseEvent,
  createEvent,
  ExecutionHistoryClient,
  getEventId,
  UnresolvedEvent,
  WorkflowEvent,
} from "@eventual/core";

export interface AWSExecutionHistoryClientProps {
  readonly dynamo: DynamoDBClient;
  readonly tableName: string;
}

export class AWSExecutionHistoryClient implements ExecutionHistoryClient {
  constructor(private props: AWSExecutionHistoryClientProps) {}

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

interface EventRecord {
  pk: { S: typeof EventRecord.PRIMARY_KEY };
  sk: { S: `${typeof EventRecord.SORT_KEY_PREFIX}${string}$${string}` };
  event: AttributeValue.SMember;
  // not all events have an ID to save space. Use getEventId to get a unique ID.
  id?: AttributeValue.SMember;
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
  const { id, timestamp, ...event } = workflowEvent as WorkflowEvent &
    Partial<BaseEvent>;
  return {
    pk: { S: EventRecord.PRIMARY_KEY },
    sk: { S: EventRecord.sortKey(executionId, getEventId(workflowEvent)) },
    // do not create an id property if it doesn't exist on the event.
    ...(id ? { id: { S: id } } : undefined),
    executionId: { S: executionId },
    // only save the parts of the event not in the record.
    event: { S: JSON.stringify(event) },
    time: { S: workflowEvent.timestamp },
  };
}
