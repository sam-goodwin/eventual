import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import type lambda from "aws-lambda";
import {
  actionWorkerFunctionName,
  executionHistoryBucket,
  tableName,
} from "../env";
import {
  createEvent,
  ExecutionHistoryClient,
} from "../clients/execution-history-client";
import { WorkflowRuntimeClient } from "../clients/workflow-runtime-client";
import {
  Activity,
  Event,
  executeWorkflow,
  getSpawnedActivities,
  isAction,
  isWorkflowStartedEvent,
  mergeEventsIntoState,
  WorkflowCompletedEvent,
  WorkflowFailedEvent,
  WorkflowTaskCompletedEvent,
  WorkflowTaskStartedEvent,
} from "@eventual/core";
import {
  isFailed,
  isResult,
  isResolved,
} from "node_modules/@eventual/core/src/result";
import { SQSWorkflowTaskMessage } from "../clients/workflow-client";
import { SQSRecord } from "aws-lambda";
import { LambdaClient } from "@aws-sdk/client-lambda";

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

const workflowRuntimeClient = new WorkflowRuntimeClient({
  dynamo,
  s3,
  // todo fail when missing
  executionHistoryBucket: executionHistoryBucket ?? "",
  tableName: tableName ?? "",
  lambda: new LambdaClient({}),
  actionWorkerFunctionName: actionWorkerFunctionName ?? "",
});
const executionHistoryClient = new ExecutionHistoryClient({
  dynamo,
  tableName: tableName ?? "",
});

/**
 * Creates an entrypoint function for orchestrating a workflow.
 */
export function orchestrator(
  program: (input: any) => Generator<any, any, any>
) {
  return async (event: lambda.SQSEvent) => {
    console.debug("Handle workflowQueue records");
    // if a polling request
    if (event.Records.some((r) => !r.attributes.MessageGroupId)) {
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

    // TODO: make workflow engine "threadsafe"
    // TODO: handle errors and partial batch failures
    for (const executionId of Object.keys(eventsByExecutionId)) {
      const records = eventsByExecutionId[executionId]!;
      await orchestrateExecution(executionId, sqsRecordsToEvents(records));
    }

    // batch by execution id
    // for each execution id

    function sqsRecordsToEvents(sqsRecords: SQSRecord[]): Event[] {
      return sqsRecords.flatMap(sqsRecordToEvents);
    }

    function sqsRecordToEvents(sqsRecord: SQSRecord): Event[] {
      const message = JSON.parse(sqsRecord.body) as SQSWorkflowTaskMessage;

      return message.event.events;
    }
  };

  async function orchestrateExecution(executionId: string, events: Event[]) {
    // load history
    const history = await workflowRuntimeClient.getHistory(executionId);

    // merge history with incoming events
    const allEvents = [...history, ...events];

    // generate state
    const state = mergeEventsIntoState(allEvents);

    const startEvent = allEvents.find(isWorkflowStartedEvent);

    if (!startEvent) {
      throw new Error(
        "No workflow started event found for execution id: " + executionId
      );
    }

    /** Events to be written to the history table at the end of the workflow task */
    const newEvents: Event[] = [];

    newEvents.push(
      createEvent<WorkflowTaskStartedEvent>({
        type: "WorkflowTaskStartedEvent",
      })
    );

    // execute workflow
    const result = executeWorkflow(program(startEvent.input), state);

    // FIXME: this won't work if multiple workflows run in parallel
    const danglingActivities = getSpawnedActivities();

    const allCommands = [
      ...danglingActivities,
      ...(Array.isArray(result) ? result : []),
    ];

    const { events: commandEvents, runDeferredCommands } =
      processCommands(allCommands);

    newEvents.push(...commandEvents);

    // update history from new commands and events
    // for now, we'll just write the awaitable command events to s3 as those are the ones needed to reconstruct the workflow.
    await workflowRuntimeClient.updateHistory(executionId, [
      ...allEvents,
      ...commandEvents,
    ]);

    // execute commands
    // don't actually send the commands until after we update history.
    // We don't want to race with the next workflow execution if somehow the command completes before we save.
    await runDeferredCommands();

    newEvents.push(
      createEvent<WorkflowTaskCompletedEvent>({
        type: "WorkflowTaskCompletedEvent",
      })
    );

    // if the workflow is complete, add success and failure to the commands.
    if (isResult(result)) {
      if (isFailed(result)) {
        const [error, message] =
          result.error instanceof Error
            ? [result.error.name, result.error.message]
            : ["Error", JSON.stringify(result.error)];

        newEvents.push(
          createEvent<WorkflowFailedEvent>({
            type: "WorkflowFailedEvent",
            error,
            message,
          })
        );

        await workflowRuntimeClient.failExecution(executionId, error, message);
      } else if (isResolved<any>(result)) {
        newEvents.push(
          createEvent<WorkflowCompletedEvent>({
            type: "WorkflowCompletedEvent",
            output: result.value,
          })
        );

        await workflowRuntimeClient.completeExecution(
          executionId,
          result.value
        );
      }
    }

    await executionHistoryClient.putEvents(executionId, [
      ...allEvents,
      ...newEvents,
    ]);

    /**
     * Generate events from commands and create a function which will start the commands.
     *
     * Does not actually write the commands out.
     */
    function processCommands(commands: Activity[]): {
      events: Event[];
      runDeferredCommands: () => Promise<void>;
    } {
      // register command events
      const commandResults: {
        event: Omit<Event, "id" | "timestamp">;
        deferredCommand: () => Promise<void>;
      }[] = commands.map((command) => {
        if (isAction(command)) {
          return {
            event: {
              type: "ActivityScheduledEvent",
              seq: command.id,
              threadId: command.threadID,
              name: command.name,
              args: command.args,
            },
            deferredCommand: () =>
              workflowRuntimeClient.scheduleAction(executionId, command),
          };
        } else {
          // TODO: the workflow can return threads and other "activities" too, not sure how to handle that yet.
          throw new Error("Unhandled command: " + JSON.stringify(command));
        }
      });

      const events = commandResults.map((c) => createEvent(c.event));

      return {
        events,
        runDeferredCommands: async () => {
          await Promise.all(commandResults.map((c) => c.deferredCommand()));
        },
      };
    }
  }
}
