import {
  AttributeValue,
  BatchWriteItemCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  ExecutionID,
  ListExecutionEventsRequest,
  ListExecutionEventsResponse,
  SortOrder,
} from "@eventual/core";
import {
  ExecutionHistoryStore,
  getLazy,
  LazyValue,
} from "@eventual/core-runtime";
import { BaseEvent, getEventId, WorkflowEvent } from "@eventual/core/internal";
import { queryPageWithToken } from "../utils.js";

export interface AWSExecutionHistoryStoreProps {
  readonly dynamo: DynamoDBClient;
  readonly executionHistoryTableName: LazyValue<string>;
}

export class AWSExecutionHistoryStore extends ExecutionHistoryStore {
  constructor(private props: AWSExecutionHistoryStoreProps) {
    super();
  }

  /**
   * Writes events as a batch into the execution history table.
   */
  public async putEvents(
    executionId: ExecutionID,
    events: WorkflowEvent[]
  ): Promise<void> {
    // TODO: partition the batches
    await this.props.dynamo.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [getLazy(this.props.executionHistoryTableName)]: events.map(
            (event) => ({
              PutRequest: {
                Item: createEventRecord(executionId, event),
              },
            })
          ),
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
        TableName: getLazy(this.props.executionHistoryTableName),
        KeyConditionExpression: "pk = :pk AND begins_with ( sk, :sk )",
        FilterExpression: after ? "#ts > :tsUpper" : undefined,
        ScanIndexForward: request.sortDirection !== SortOrder.Desc,
        ExpressionAttributeValues: {
          ":pk": { S: EventRecord.partitionKey(request.executionId as ExecutionID) },
          ":sk": {
            S: EventRecord.SORT_KEY_PREFIX,
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
    const events = output.records.map(({ event, time, id }) => ({
      ...JSON.parse(event!.S!),
      ...(id ? { id: id?.S } : {}),
      timestamp: time!.S,
    }));

    return {
      events,
      nextToken: output.nextToken,
    };
  }
}

interface EventRecord {
  pk: { S: ExecutionID };
  sk: { S: `$${string}` };
  event: AttributeValue.SMember;
  // not all events have an ID to save space. Use getEventId to get a unique ID.
  id?: AttributeValue.SMember;
  time: AttributeValue.SMember;
}

const EventRecord = {
  partitionKey: (executionId: ExecutionID) => executionId,
  SORT_KEY_PREFIX: `$` as const,
  sortKey(timestamp: string, id: string): `$${string}` {
    return `${EventRecord.SORT_KEY_PREFIX}${timestamp}${id}`;
  },
};

function createEventRecord(
  executionId: ExecutionID,
  workflowEvent: WorkflowEvent
): EventRecord & Record<string, AttributeValue> {
  const { id, timestamp, ...event } = workflowEvent as WorkflowEvent &
    Partial<BaseEvent>;
  return {
    pk: { S: EventRecord.partitionKey(executionId) },
    sk: {
      S: EventRecord.sortKey(
        workflowEvent.timestamp,
        getEventId(workflowEvent)
      ),
    },
    // do not create an id property if it doesn't exist on the event.
    ...(id ? { id: { S: id } } : undefined),
    // only save the parts of the event not in the record.
    event: { S: JSON.stringify(event) },
    time: { S: workflowEvent.timestamp },
  };
}
