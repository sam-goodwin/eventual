import {
  AttributeValue,
  BatchWriteItemCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  BaseEvent,
  getEventId,
  ListExecutionEventsRequest,
  ListExecutionEventsResponse,
  SortOrder,
  WorkflowEvent,
} from "@eventual/core";
import {
  ExecutionHistoryStore,
  getLazy,
  LazyValue,
} from "@eventual/runtime-core";
import { queryPageWithToken } from "../utils.js";

export interface AWSExecutionHistoryStoreProps {
  readonly dynamo: DynamoDBClient;
  readonly tableName: LazyValue<string>;
}

export class AWSExecutionHistoryStore extends ExecutionHistoryStore {
  constructor(private props: AWSExecutionHistoryStoreProps) {
    super();
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
          [getLazy(this.props.tableName)]: events.map((event) => ({
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
    request: ListExecutionEventsRequest
  ): Promise<ListExecutionEventsResponse> {
    // normalize the date given and ensure it is a valid date.
    const after = request.after ? new Date(request.after) : undefined;
    const output = await queryPageWithToken<EventRecord>(
      {
        dynamoClient: this.props.dynamo,
        pageSize: request.maxResults ?? 100,
        keys: ["pk", "sk"],
        nextToken: request.nextToken,
      },
      {
        TableName: getLazy(this.props.tableName),
        KeyConditionExpression: "pk = :pk AND begins_with ( sk, :sk )",
        FilterExpression: after ? "#ts > :tsUpper" : undefined,
        ScanIndexForward: request.sortDirection !== SortOrder.Desc,
        ExpressionAttributeValues: {
          ":pk": { S: EventRecord.PARTITION_KEY },
          ":sk": {
            S: EventRecord.sortKey(request.executionId, "", ""),
          },
          ...(after
            ? {
                ":tsUpper": {
                  S: after.toISOString(),
                },
              }
            : {}),
        },
        ExpressionAttributeNames: after
          ? { "#ts": "time" satisfies keyof EventRecord }
          : undefined,
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
    timestamp: string,
    id: string
  ): `${typeof this.SORT_KEY_PREFIX}${string}$${string}` {
    return `${this.SORT_KEY_PREFIX}${executionId}$${timestamp}${id}`;
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
    sk: {
      S: EventRecord.sortKey(
        executionId,
        workflowEvent.timestamp,
        getEventId(workflowEvent)
      ),
    },
    // do not create an id property if it doesn't exist on the event.
    ...(id ? { id: { S: id } } : undefined),
    executionId: { S: executionId },
    // only save the parts of the event not in the record.
    event: { S: JSON.stringify(event) },
    time: { S: workflowEvent.timestamp },
  };
}
