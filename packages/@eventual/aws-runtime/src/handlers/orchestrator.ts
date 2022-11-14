import { createEvent } from "../clients/execution-history-client.js";
import {
  WorkflowEvent,
  isFailed,
  isResolved,
  isResult,
  isWorkflowStarted,
  WorkflowCompleted,
  WorkflowEventType,
  WorkflowTaskStarted,
  WorkflowTaskCompleted,
  WorkflowFailed,
  interpret,
  isHistoryEvent,
  Command,
  Program,
  ActivityScheduled,
  HistoryStateEvents,
} from "@eventual/core";
import { SQSWorkflowTaskMessage } from "../clients/workflow-client.js";
import {
  createExecutionHistoryClient,
  createWorkflowRuntimeClient,
} from "../clients/index.js";
import { SQSHandler, SQSRecord } from "aws-lambda";

const executionHistoryClient = createExecutionHistoryClient();
const workflowRuntimeClient = createWorkflowRuntimeClient();

/**
 * Creates an entrypoint function for orchestrating a workflow.
 */
export function orchestrator(
  program: (...args: any[]) => Program<any>
): SQSHandler {
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

    // TODO: handle errors and partial batch failures
    // for each execution id
    await Promise.all(
      Object.entries(eventsByExecutionId).map(([executionId, records]) =>
        orchestrateExecution(executionId, sqsRecordsToEvents(records))
      )
    );

    return {
      batchItemFailures: [],
    };

    function sqsRecordsToEvents(sqsRecords: SQSRecord[]) {
      return sqsRecords.flatMap(sqsRecordToEvents);
    }

    function sqsRecordToEvents(sqsRecord: SQSRecord) {
      const message = JSON.parse(sqsRecord.body) as SQSWorkflowTaskMessage;

      return message.task.events;
    }
  };

  async function orchestrateExecution(
    executionId: string,
    events: HistoryStateEvents[]
  ) {
    /** Events to be written to the history table at the end of the workflow task */
    const newEvents: WorkflowEvent[] = [];

    newEvents.push(
      createEvent<WorkflowTaskStarted>({
        type: WorkflowEventType.WorkflowTaskStarted,
      })
    );

    console.debug("Load history");
    // load history
    const history = await workflowRuntimeClient.getHistory(executionId);

    // historical events and incoming events will be fed into the workflow to resume/progress state
    const inputEvents = [...history, ...events];

    console.debug(
      "Running workflow with events: " + JSON.stringify(inputEvents)
    );
    const startEvent = inputEvents.find(isWorkflowStarted);

    if (!startEvent) {
      throw new Error(
        "No workflow started event found for execution id: " + executionId
      );
    }

    console.log("program: " + program);

    // execute workflow
    const { result, commands: newCommands } = interpret(
      program(startEvent.input),
      inputEvents.filter(isHistoryEvent)
    );

    console.debug("Workflow terminated with: " + JSON.stringify(result));

    console.info(`Found ${newCommands.length} new commands.`);

    const commandEvents = await processCommands(newCommands);

    newEvents.push(...commandEvents);

    // update history from new commands and events
    // for now, we'll just write the awaitable command events to s3 as those are the ones needed to reconstruct the workflow.
    await workflowRuntimeClient.updateHistory(executionId, [
      ...inputEvents,
      ...commandEvents,
    ]);

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
    async function processCommands(
      commands: Command[]
    ): Promise<HistoryStateEvents[]> {
      // register command events
      return await Promise.all(
        commands.map(async (command) => {
          await workflowRuntimeClient.scheduleActivity(executionId, command);

          return createEvent<ActivityScheduled>({
            type: WorkflowEventType.ActivityScheduled,
            seq: command.seq,
            name: command.name,
          });
        })
      );
    }
  }
}
