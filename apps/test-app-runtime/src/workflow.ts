import { Handler, SQSHandler, SQSRecord } from "aws-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";
import {
  InvocationType,
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import {
  executionHistoryBucket,
  ExecutionHistoryClient,
  SQSWorkflowTaskMessage,
  tableName,
  WorkflowClient,
  workflowQueueUrl,
  WorkflowRuntimeClient,
} from "@eventual/aws-runtime";
import {
  assertEventType,
  Command,
  InlineActivityCompletedEvent,
  InlineActivityScheduledEvent,
  WorkflowStartedEvent,
  Event,
  InlineActivityFailedEvent,
  WorkflowCompletedEvent,
  WorkflowTaskCompletedEvent,
  WorkflowTaskStartedEvent,
} from "@eventual/core";

// self
const workflowFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME ?? "";

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});
const lambda = new LambdaClient({});
const sqs = new SQSClient({});

const workflowRuntimeClient = new WorkflowRuntimeClient({
  dynamo,
  s3,
  // todo fail when missing
  executionHistoryBucket: executionHistoryBucket ?? "",
  tableName: tableName ?? "",
});
const executionHistoryClient = new ExecutionHistoryClient({
  dynamo,
  tableName: tableName ?? "",
});
const workflowClient = new WorkflowClient({
  sqs,
  workflowQueueUrl: workflowQueueUrl ?? "",
  executionHistory: executionHistoryClient,
  dynamo,
  tableName: tableName ?? "",
});

interface InlineActivityRequest {
  executionId: string;
  activityCounter: number;
}

interface WorkflowFunctionHandler {
  (...params: Parameters<SQSHandler>): ReturnType<SQSHandler>;
  (...params: Parameters<Handler<InlineActivityRequest, void>>): ReturnType<
    Handler<InlineActivityRequest, void>
  >;
}

// TODO abstract to a workflow function in aws-runtime.
export const workflow: WorkflowFunctionHandler = async (event) => {
  if ("Records" in event) {
    // if a polling request
    if (event.Records.some((r) => !!r.attributes.MessageGroupId)) {
      throw new Error("Expected SQS Records to contain fifo message id");
    }

    const eventsByExecutionId = event.Records.reduce(
      (obj: Record<string, SQSRecord[]>, r) => ({
        ...obj,
        [r.attributes.MessageGroupId!]: [
          ...(obj[r.attributes.MessageGroupId!] || []),
          r,
        ],
      }),
      {}
    );

    const executionIds = Object.keys(eventsByExecutionId);

    console.log("Found execution ids: " + executionIds.join(", "));

    await Promise.all(
      Object.entries(eventsByExecutionId).map(async ([executionId, records]) =>
        handleExecutionEvents(executionId, sqsRecordsToEvents(records))
      )
    );
  } else {
    // if a direct async invoke
    await invokeInlineActivity(event.executionId, event.activityCounter);
  }
};

function sqsRecordsToEvents(sqsRecords: SQSRecord[]): Event[] {
  return sqsRecords.flatMap(sqsRecordToEvents);
}

function sqsRecordToEvents(sqsRecord: SQSRecord): Event[] {
  const message = JSON.parse(sqsRecord.body) as SQSWorkflowTaskMessage;

  return message.event.events;
}

async function invokeInlineActivity(
  executionId: string,
  activityCount: number
) {
  const historyEvents = await workflowRuntimeClient.getHistory(executionId);

  try {
    // call activity
    const activityResult = await new Promise<any>(async (resolve, reject) => {
      const client = new EventualClient(historyEvents, {
        type: "InvokeActivity",
        activityCount,
        activityResultResolve: resolve,
        activityResultReject: reject,
      });

      try {
        await actualWorkflow(client.input, client);
        // if the activity was found and run, we the next rejects will do nothing.
        // TODO, throw something?
        reject("Activity Not Found");
      } catch {
        reject("Activity Not Found");
      }
    });

    // add the activity completed to history
    const activityCompletedEvent =
      await executionHistoryClient.putEvent<InlineActivityCompletedEvent>(
        executionId,
        {
          type: "InlineActivityCompletedEvent",
          counter: activityCount,
          // TODO save to execution data client
          result: activityResult,
        }
      );

    // send workflow task to workflow queue
    await workflowClient.submitWorkflowTask(
      executionId,
      activityCompletedEvent
    );
  } catch (err) {
    // add the activity completed to history
    const activityFailedEvent =
      await executionHistoryClient.putEvent<InlineActivityFailedEvent>(
        executionId,
        {
          type: "InlineActivityFailedEvent",
          counter: activityCount,
          // TODO save to execution data client
          error: (err as Error).name,
          message: (err as Error).message,
        }
      );

    await workflowClient.submitWorkflowTask(executionId, activityFailedEvent);
  }
}

async function handleExecutionEvents(executionId: string, events: Event[]) {
  // to be put into the history after the workflow is run.
  const newEvents: Event[] = [];

  newEvents.push(
    await executionHistoryClient.putEvent<WorkflowTaskStartedEvent>(
      executionId,
      {
        type: "WorkflowTaskStartedEvent",
      }
    )
  );

  // get current history from s3
  const historyEvents = await workflowRuntimeClient.getHistory(executionId);

  const commands: Command[] = [];

  // invoke workflow
  const client = new EventualClient([...historyEvents, ...events], {
    type: "ProgressWorkflow",
    commandSink: (command) => {
      commands.push(command);
    },
  });

  let result;
  let done = true;

  try {
    result = await actualWorkflow(client.input, client);
  } catch {
    done = false;
  }

  // evaluate the workflow result, execute commands,
  for (const command of commands) {
    if (command.type === "StartLocalActivityCommand") {
      const event =
        await executionHistoryClient.putEvent<InlineActivityScheduledEvent>(
          executionId,
          {
            type: "InlineActivityScheduledEvent",
            counter: command.counter,
          }
        );

      const request: InlineActivityRequest = {
        activityCounter: command.counter,
        executionId: executionId,
      };

      await lambda.send(
        new InvokeCommand({
          FunctionName: workflowFunctionName,
          InvocationType: InvocationType.Event,
          Payload: Buffer.from(JSON.stringify(request)),
        })
      );

      newEvents.push(event);
    }
  }

  newEvents.push(
    await executionHistoryClient.putEvent<WorkflowTaskCompletedEvent>(
      executionId,
      {
        type: "WorkflowTaskEvent",
      }
    )
  );

  if (done) {
    newEvents.push(
      await executionHistoryClient.putEvent<WorkflowCompletedEvent>(
        executionId,
        {
          type: "WorkflowCompletedEvent",
          output: result,
        }
      )
    );
  }

  await workflowRuntimeClient.updateHistory(executionId, [
    ...historyEvents,
    ...events,
    ...newEvents,
  ]);
}

interface TestInput {
  value: string;
}

async function actualWorkflow(input: TestInput, client: EventualClient) {
  return await client.activity(() => input.value + "hi");
}

// prototype
class EventualClient {
  private _events;
  private activityCounter: number = 0;
  private _input: any | undefined;
  private emit: boolean = true;
  // private rejects: typeof Promise["reject"][] = [];

  constructor(
    events: Event[],
    private runTypeConfig:
      | {
          type: "ProgressWorkflow";
          commandSink: (...commands: Command[]) => void;
        }
      | {
          type: "InvokeActivity";
          activityCount: number;
          activityResultResolve: (v: any) => void;
          activityResultReject: (v: any) => void;
        }
  ) {
    const [first, ...e] = events;

    assertEventType<WorkflowStartedEvent>(first, "WorkflowStartedEvent");

    this._input = first.input;

    this._events = e;
  }

  get input(): any | undefined {
    return this._input;
  }

  async activity<T>(handler: () => Promise<T> | T): Promise<T> {
    if (this._events.length === 0) {
      if (this.runTypeConfig.type === "ProgressWorkflow") {
        if (this.emit) {
          this.runTypeConfig.commandSink({
            type: "StartLocalActivityCommand",
            counter: this.activityCounter++,
          });

          // TODO - support concurrent, turn off emit once events are consumed.
          this.emit = false;
          return Promise.reject(new Error("WAITING"));

          // return new Promise((_, reject) => () => {
          //   this.rejects.push(reject as typeof Promise["reject"]);
          // }) as Promise<T>;
        } else {
          return Promise.reject(new Error("SKIP"));
        }
      } else {
        if (this.activityCounter === this.runTypeConfig.activityCount) {
          try {
            const result = await handler();
            this.runTypeConfig.activityResultResolve(result);
          } catch (err) {
            this.runTypeConfig.activityResultReject(err);
          }
          return Promise.reject(new Error("DONE"));
        } else {
          return Promise.reject(new Error("SKIP"));
        }
      }
    } else {
      const [first, second, ...rest] = this._events;
      this._events = rest; // TODO, abstract this away and support parallel cases.

      assertEventType<InlineActivityScheduledEvent>(
        first,
        "InlineActivityScheduledEvent"
      );

      if (first.counter !== this.activityCounter) {
        throw new Error("Non Determinism!");
      }

      assertEventType<InlineActivityCompletedEvent>(
        second,
        "InlineActivityCompletedEvent"
      );

      return second.result;
    }
  }
}
