import {
  AttributeValue,
  BatchWriteItemCommand,
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  BaseEvent,
  ExecutionEventsRequest,
  ExecutionEventsResponse,
  ExecutionHistoryClient,
  getEventId,
  WorkflowEvent,
} from "@eventual/core";
import { queryPageWithToken } from "./utils.js";

export interface AWSExecutionHistoryClientProps {
  readonly dynamo: DynamoDBClient;
  readonly tableName: string;
}

export class AWSExecutionHistoryClient extends ExecutionHistoryClient {
  constructor(private props: AWSExecutionHistoryClientProps) {
    super();
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
  public async getEvents(
    request: ExecutionEventsRequest
  ): Promise<ExecutionEventsResponse> {
    const output = await queryPageWithToken<EventRecord>(
      {
        dynamoClient: this.props.dynamo,
        pageSize: request.maxResults ?? 100,
        keys: ["pk", "sk"],
        nextToken: request.nextToken,
      },
      {
        TableName: this.props.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with ( sk, :sk )",
        ScanIndexForward: request.sortDirection !== "Desc",
        ExpressionAttributeValues: {
          ":pk": { S: EventRecord.PARTITION_KEY },
          ":sk": { S: EventRecord.sortKey(request.executionId, "") },
        },
        ConsistentRead: true,
      }
    );
    const events = output.records.map(({ event, time }) => ({
      ...JSON.parse(event!.S!),
      timestamp: time!.S,
    }));

    return {
      events,
      nextToken: output.nextToken,
    };
  }
}

interface EventRecord {
  pk: { S: typeof EventRecord.PARTITION_KEY };
  sk: { S: `${typeof EventRecord.SORT_KEY_PREFIX}${string}$${string}` };
  event: AttributeValue.SMember;
  // not all events have an ID to save space. Use getEventId to get a unique ID.
  id?: AttributeValue.SMember;
  executionId: AttributeValue.SMember;
  time: AttributeValue.SMember;
}

const EventRecord = {
  PARTITION_KEY: "ExecutionHistory",
  SORT_KEY_PREFIX: `Event$`,
  sortKey(
    executionId: string,
    id: string
  ): `${typeof this.SORT_KEY_PREFIX}${string}$${string}` {
    return `${this.SORT_KEY_PREFIX}${executionId}$${id}`;
  },
};

function createEventRecord(
  executionId: string,
  workflowEvent: WorkflowEvent
): EventRecord & Record<string, AttributeValue> {
  const { id, timestamp, ...event } = workflowEvent as WorkflowEvent &
    Partial<BaseEvent>;
  return {
    pk: { S: EventRecord.PARTITION_KEY },
    sk: { S: EventRecord.sortKey(executionId, getEventId(workflowEvent)) },
    // do not create an id property if it doesn't exist on the event.
    ...(id ? { id: { S: id } } : undefined),
    executionId: { S: executionId },
    // only save the parts of the event not in the record.
    event: { S: JSON.stringify(event) },
    time: { S: workflowEvent.timestamp },
  };
}
