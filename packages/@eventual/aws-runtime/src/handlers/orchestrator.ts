import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import {
  actionWorkerFunctionName,
  executionHistoryBucket,
  tableName,
} from "../env.js";
import {
  createEvent,
  ExecutionHistoryClient,
} from "../clients/execution-history-client.js";
import { WorkflowRuntimeClient } from "../clients/workflow-runtime-client.js";
import {
  Activity,
  WorkflowEvent,
  executeWorkflow,
  isAction,
  isFailed,
  isResolved,
  isResult,
  isWorkflowStarted,
  mergeEventsIntoState,
  Thread,
  WorkflowCompleted,
  WorkflowEventType,
  WorkflowTaskStarted,
  WorkflowTaskCompleted,
  WorkflowFailed,
} from "@eventual/core";
import { SQSWorkflowTaskMessage } from "../clients/workflow-client.js";
import { SQSHandler, SQSRecord } from "aws-lambda";
import { LambdaClient } from "@aws-sdk/client-lambda";

const s3 = new S3Client({ region: process.env.AWS_REGION });
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });

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
export function orchestrator(program: (input: any) => Thread): SQSHandler {
  return async (event) => {
    console.debug("Handle workflowQueue records");
    // if a polling request
    if (event.Records.some((r) => !r.attributes.MessageGroupId)) {
      throw new Error("Expected SQS Records to contain fifo message id");
    }

    // batch by execution id
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
    // for each execution id
    for (const executionId of Object.keys(eventsByExecutionId)) {
      const records = eventsByExecutionId[executionId]!;
      await orchestrateExecution(executionId, sqsRecordsToEvents(records));
    }

    return {
      batchItemFailures: [],
    };

    function sqsRecordsToEvents(sqsRecords: SQSRecord[]): WorkflowEvent[] {
      return sqsRecords.flatMap(sqsRecordToEvents);
    }

    function sqsRecordToEvents(sqsRecord: SQSRecord): WorkflowEvent[] {
      const message = JSON.parse(sqsRecord.body) as SQSWorkflowTaskMessage;

      return message.event.events;
    }
  };

  async function orchestrateExecution(
    executionId: string,
    events: WorkflowEvent[]
  ) {
    console.debug("Load history");
    // load history
    const history = await workflowRuntimeClient.getHistory(executionId);

    // merge history with incoming events
    const allEvents = [...history, ...events];

    // generate state
    const state = mergeEventsIntoState(allEvents);

    console.debug("Running workflow with state: " + JSON.stringify(state));
    const startEvent = allEvents.find(isWorkflowStarted);

    if (!startEvent) {
      throw new Error(
        "No workflow started event found for execution id: " + executionId
      );
    }

    /** Events to be written to the history table at the end of the workflow task */
    const newEvents: WorkflowEvent[] = [];

    newEvents.push(
      createEvent<WorkflowTaskStarted>({
        type: WorkflowEventType.WorkflowTaskStarted,
      })
    );

    console.log("program: " + program);

    // execute workflow
    const result = executeWorkflow(program(startEvent.input).thread, state);

    console.debug("Workflow terminated with: " + JSON.stringify(result));

    const newCommands = Array.isArray(result) ? result : [];

    console.info(`Found ${newCommands.length} new commands.`);

    const { events: commandEvents, runDeferredCommands } =
      processCommands(newCommands);

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
      createEvent<WorkflowTaskCompleted>({
        type: WorkflowEventType.WorkflowTaskCompleted,
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
          createEvent<WorkflowFailed>({
            type: WorkflowEventType.WorkflowFailed,
            error,
            message,
          })
        );

        await workflowRuntimeClient.failExecution(executionId, error, message);
      } else if (isResolved<any>(result)) {
        newEvents.push(
          createEvent<WorkflowCompleted>({
            type: WorkflowEventType.WorkflowCompleted,
            output: result.value,
          })
        );

        await workflowRuntimeClient.completeExecution(
          executionId,
          result.value
        );
      }
    }

    await executionHistoryClient.putEvents(executionId, newEvents);

    /**
     * Generate events from commands and create a function which will start the commands.
     *
     * Does not actually write the commands out.
     */
    function processCommands(commands: Activity[]): {
      events: WorkflowEvent[];
      runDeferredCommands: () => Promise<void>;
    } {
      // register command events
      const commandResults: {
        event: Omit<WorkflowEvent, "id" | "timestamp">;
        deferredCommand: () => Promise<void>;
      }[] = commands.map((command) => {
        if (isAction(command)) {
          return {
            event: {
              type: WorkflowEventType.ActivityScheduled,
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
