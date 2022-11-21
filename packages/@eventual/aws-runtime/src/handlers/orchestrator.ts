import { createEvent } from "../clients/execution-history-client.js";
import {
  WorkflowEvent,
  isFailed,
  isResolved,
  isResult,
  WorkflowCompleted,
  WorkflowEventType,
  WorkflowTaskStarted,
  WorkflowTaskCompleted,
  WorkflowFailed,
  Command,
  ActivityScheduled,
  HistoryStateEvents,
  CompleteExecution,
  FailedExecution,
  ExecutionStatus,
  isCompleteExecution,
  progressWorkflow,
  Workflow,
} from "@eventual/core";
import { SQSWorkflowTaskMessage } from "../clients/workflow-client.js";
import {
  createExecutionHistoryClient,
  createWorkflowRuntimeClient,
} from "../clients/index.js";
import { SQSHandler, SQSRecord } from "aws-lambda";
import { createMetricsLogger, Unit } from "aws-embedded-metrics";
import { timed, timedSync } from "../metrics/utils.js";
import { workflowName } from "../env.js";
import { MetricsCommon, OrchestratorMetrics } from "../metrics/constants.js";
import { WorkflowContext } from "@eventual/core";

const executionHistoryClient = createExecutionHistoryClient();
const workflowRuntimeClient = createWorkflowRuntimeClient();

/**
 * Creates an entrypoint function for orchestrating a workflow.
 */
export function orchestrator(workflow: Workflow): SQSHandler {
  return async (event) => {
    console.debug("Handle workflowQueue records");
    // if a polling request
    if (event.Records.some((r) => !r.attributes.MessageGroupId)) {
      throw new Error("Expected SQS Records to contain fifo message id");
    }

    // batch by execution id
    const eventsByExecutionId = groupBy(
      event.Records,
      (r) => r.attributes.MessageGroupId!
    );

    console.log(
      "Found execution ids: " + Object.keys(eventsByExecutionId).join(", ")
    );

    // for each execution id
    const results = await promiseAllSettledPartitioned(
      Object.entries(eventsByExecutionId),
      async ([executionId, records]) =>
        orchestrateExecution(workflow, executionId, records)
    );

    console.debug(
      "Executions succeeded: " +
        results.fulfilled.map(([[executionId]]) => executionId).join(",")
    );

    if (results.rejected.length > 0) {
      console.error(
        "Executions failed: \n" +
          results.rejected
            .map(([[executionId], error]) => `${executionId}: ${error}`)
            .join("\n")
      );
    }

    const failedMessageIds = results.rejected.flatMap(
      ([[, records]]) => records.map((r) => r.messageId) ?? []
    );

    return {
      batchItemFailures: failedMessageIds.map((r) => ({
        itemIdentifier: r,
      })),
    };
  };
}

async function orchestrateExecution(
  workflow: Workflow,
  executionId: string,
  records: SQSRecord[]
) {
  const metrics = createMetricsLogger();
  metrics.resetDimensions(false);
  metrics.setNamespace(MetricsCommon.EventualNamespace);
  metrics.setDimensions({
    [MetricsCommon.WorkflowNameDimension]: workflowName(),
  });
  const events = sqsRecordsToEvents(records);
  const start = new Date();
  try {
    // number of events that came from the workflow task
    metrics.setProperty(OrchestratorMetrics.TaskEvents, events.length);
    // number of workflow tasks that are being processed in the batch (max: 10)
    metrics.setProperty(OrchestratorMetrics.AggregatedTasks, records.length);

    /** Events to be written to the history table at the end of the workflow task */
    const newEvents: WorkflowEvent[] = [];

    metrics.setProperty(OrchestratorMetrics.ExecutionId, executionId);
    metrics.setProperty(
      OrchestratorMetrics.Version,
      OrchestratorMetrics.VersionV1
    );
    // length of time the oldest SQS record was in the queue.
    const maxTaskAge = Math.max(
      ...records.map(
        (r) => new Date().getTime() - Number(r.attributes.SentTimestamp)
      )
    );
    metrics.putMetric(
      OrchestratorMetrics.MaxTaskAge,
      maxTaskAge,
      Unit.Milliseconds
    );

    newEvents.push(
      createEvent<WorkflowTaskStarted>({
        type: WorkflowEventType.WorkflowTaskStarted,
      })
    );

    console.debug("Load history");
    // load history
    const history = await timed(
      metrics,
      OrchestratorMetrics.LoadHistoryDuration,
      async () => workflowRuntimeClient.getHistory(executionId)
    );

    metrics.setProperty(
      OrchestratorMetrics.LoadedHistoryEvents,
      history.length
    );

    const workflowContext: WorkflowContext = {
      name: workflowName(),
    };

    const {
      result,
      commands: newCommands,
      history: updatedHistory,
    } = timedSync(metrics, OrchestratorMetrics.AdvanceExecutionDuration, () => {
      return progressWorkflow(
        workflow,
        history,
        events,
        workflowContext,
        executionId
      );
    });

    metrics.setProperty(
      OrchestratorMetrics.AdvanceExecutionEvents,
      updatedHistory.length
    );

    console.debug("Workflow terminated with: " + JSON.stringify(result));

    console.info(`Found ${newCommands.length} new commands.`);

    const commandEvents = await timed(
      metrics,
      OrchestratorMetrics.InvokeCommandsDuration,
      () => processCommands(newCommands)
    );

    metrics.putMetric(
      OrchestratorMetrics.CommandsInvoked,
      newCommands.length,
      Unit.Count
    );

    // tracks the time it takes for a workflow task to be scheduled until new commands could be emitted.
    // This represent the workflow orchestration time of User Perceived Latency
    // Average expected time for an activity to be invoked until it is considered complete by the workflow should follow:
    // AvgActivityDuration(N) = Avg(TimeToCommandsInvoked) + Avg(ActivityDuration(N))
    metrics.putMetric(
      OrchestratorMetrics.TimeToCommandsInvoked,
      maxTaskAge + (new Date().getTime() - start.getTime())
    );

    newEvents.push(...commandEvents);

    const newHistoryEvents = [...updatedHistory, ...commandEvents];

    // update history from new commands and events
    // for now, we'll just write the awaitable command events to s3 as those are the ones needed to reconstruct the workflow.
    const { bytes: historyUpdatedBytes } = await timed(
      metrics,
      OrchestratorMetrics.SaveHistoryDuration,
      () => workflowRuntimeClient.updateHistory(executionId, newHistoryEvents)
    );

    metrics.setProperty(
      OrchestratorMetrics.SavedHistoryEvents,
      newHistoryEvents.length
    );
    metrics.putMetric(
      OrchestratorMetrics.SavedHistoryBytes,
      historyUpdatedBytes,
      Unit.Bytes
    );

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

        const execution = await timed(
          metrics,
          OrchestratorMetrics.ExecutionStatusUpdateDuration,
          () => workflowRuntimeClient.failExecution(executionId, error, message)
        );

        logExecutionCompleteMetrics(execution);
      } else if (isResolved<any>(result)) {
        newEvents.push(
          createEvent<WorkflowCompleted>({
            type: WorkflowEventType.WorkflowCompleted,
            output: result.value,
          })
        );

        const execution = await timed(
          metrics,
          OrchestratorMetrics.ExecutionStatusUpdateDuration,
          () =>
            workflowRuntimeClient.completeExecution(executionId, result.value)
        );
        logExecutionCompleteMetrics(execution);
      }
    }

    await timed(
      metrics,
      OrchestratorMetrics.AddNewExecutionEventsDuration,
      () => executionHistoryClient.putEvents(executionId, newEvents)
    );
    metrics.setProperty(
      OrchestratorMetrics.NewExecutionEvents,
      newEvents.length
    );

    function logExecutionCompleteMetrics(
      execution: CompleteExecution | FailedExecution
    ) {
      metrics.putMetric(
        OrchestratorMetrics.ExecutionComplete,
        execution.status === ExecutionStatus.COMPLETE ? 1 : 0,
        Unit.Count
      );
      metrics.putMetric(
        OrchestratorMetrics.ExecutionFailed,
        execution.status === ExecutionStatus.COMPLETE ? 0 : 1,
        Unit.Count
      );
      console.log("logging for execution" + JSON.stringify(execution));
      metrics.putMetric(
        OrchestratorMetrics.ExecutionTotalDuration,
        new Date(execution.endTime).getTime() -
          new Date(execution.startTime).getTime()
      );
      if (isCompleteExecution(execution)) {
        metrics.putMetric(
          OrchestratorMetrics.ExecutionResultBytes,
          execution.result ? JSON.stringify(execution.result).length : 0,
          Unit.Bytes
        );
      }
    }

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
  } finally {
    await metrics.flush();
  }
}

function sqsRecordsToEvents(sqsRecords: SQSRecord[]) {
  return sqsRecords.flatMap(sqsRecordToEvents);
}

function sqsRecordToEvents(sqsRecord: SQSRecord) {
  const message = JSON.parse(sqsRecord.body) as SQSWorkflowTaskMessage;

  return message.task.events;
}

async function promiseAllSettledPartitioned<T, R>(
  items: T[],
  op: (item: T) => Promise<R>
): Promise<{
  fulfilled: [T, Awaited<R>][];
  rejected: [T, string][];
}> {
  const results = await Promise.allSettled(items.map(op));

  const enumerated = results.map((r, i) => [r, i] as const);

  return {
    fulfilled: enumerated
      .filter(
        (t): t is [PromiseFulfilledResult<Awaited<R>>, number] =>
          t[0].status === "fulfilled"
      )
      .map(([r, i]) => [items[i]!, r.value] as [T, Awaited<R>]),
    rejected: enumerated
      .filter(
        (t): t is [PromiseRejectedResult, number] => t[0].status === "rejected"
      )
      .map(([r, i]) => [items[i]!, r.reason] as [T, string]),
  };
}

function groupBy<T>(
  items: T[],
  extract: (item: T) => string
): Record<string, T[]> {
  return items.reduce((obj: Record<string, T[]>, r) => {
    const id = extract(r);
    return {
      ...obj,
      [id]: [...(obj[id] || []), r],
    };
  }, {});
}
