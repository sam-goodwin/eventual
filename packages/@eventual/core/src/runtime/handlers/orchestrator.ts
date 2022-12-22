import { inspect } from "util";
import { Command } from "../../command.js";
import { WorkflowContext } from "../../context.js";
import {
  createEvent,
  getEventId,
  HistoryStateEvent,
  isHistoryEvent,
  isSleepCompleted,
  isWorkflowCompleted,
  isWorkflowFailed,
  isWorkflowStarted,
  WorkflowCompleted,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowFailed,
  WorkflowTaskCompleted,
  WorkflowTaskStarted,
  WorkflowTimedOut,
} from "../../workflow-events.js";
import {
  CompleteExecution,
  ExecutionStatus,
  FailedExecution,
  isCompleteExecution,
} from "../../execution.js";
import { isFailed, isResolved, isResult, Result } from "../../result.js";
import { lookupWorkflow, progressWorkflow, Workflow } from "../../workflow.js";
import {
  EventClient,
  ExecutionHistoryClient,
  MetricsClient,
  Schedule,
  TimerClient,
  WorkflowClient,
  WorkflowRuntimeClient,
} from "../clients/index.js";
import { CommandExecutor } from "../command-executor.js";
import { isExecutionId, parseWorkflowName } from "../execution-id.js";
import type { Logger } from "../logger.js";
import { MetricsCommon, OrchestratorMetrics } from "../metrics/constants.js";
import { MetricsLogger } from "../metrics/metrics-logger.js";
import { Unit } from "../metrics/unit.js";
import { timed, timedSync } from "../metrics/utils.js";
import { promiseAllSettledPartitioned } from "../utils.js";
import { extendsError } from "../../util.js";

/**
 * The Orchestrator's client dependencies.
 */
export interface OrchestratorDependencies {
  executionHistoryClient: ExecutionHistoryClient;
  timerClient: TimerClient;
  workflowRuntimeClient: WorkflowRuntimeClient;
  workflowClient: WorkflowClient;
  metricsClient: MetricsClient;
  eventClient: EventClient;
  logger: Logger;
}

export interface OrchestratorResult {
  /**
   * IDs of the Executions that failed to orchestrate.
   */
  failedExecutionIds: string[];
}

export interface Orchestrator {
  orchestrateExecutions(
    eventsByExecutionId: Record<string, HistoryStateEvent[]>,
    baseTime?: Date
  ): Promise<OrchestratorResult>;

  orchestrateExecution(
    workflow: Workflow,
    executionId: string,
    events: HistoryStateEvent[],
    baseTime: Date
  ): Promise<void>;
}

/**
 * Creates a generic function for orchestrating a batch of executions
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createOrchestrator({
  executionHistoryClient,
  timerClient,
  workflowRuntimeClient,
  workflowClient,
  metricsClient,
  eventClient,
  logger,
}: OrchestratorDependencies): Orchestrator {
  const commandExecutor = new CommandExecutor({
    timerClient,
    workflowClient,
    workflowRuntimeClient,
    eventClient,
  });

  return {
    orchestrateExecutions: async (
      eventsByExecutionId,
      baseTime = new Date()
    ) => {
      logger.debug("Handle workflowQueue records");

      logger.info(
        "Found execution ids: " + Object.keys(eventsByExecutionId).join(", ")
      );

      // for each execution id
      const results = await promiseAllSettledPartitioned(
        Object.entries(eventsByExecutionId),
        async ([executionId, records]) => {
          if (!isExecutionId(executionId)) {
            throw new Error(`invalid ExecutionID: '${executionId}'`);
          }
          const workflowName = parseWorkflowName(executionId);
          if (workflowName === undefined) {
            throw new Error(`execution ID '${executionId}' does not exist`);
          }
          const workflow = lookupWorkflow(workflowName);
          if (workflow === undefined) {
            throw new Error(`no such workflow with name '${workflowName}'`);
          }
          // TODO: get workflow from execution id
          return orchestrateExecution(workflow, executionId, records, baseTime);
        }
      );

      logger.debug(
        "Executions succeeded: " +
          results.fulfilled.map(([[executionId]]) => executionId).join(",")
      );

      if (results.rejected.length > 0) {
        logger.error(
          "Executions failed: \n" +
            results.rejected
              .map(([[executionId], error]) => `${executionId}: ${error}`)
              .join("\n")
        );
      }

      return {
        failedExecutionIds: results.rejected.map((rejected) => rejected[0][0]),
      };
    },
    orchestrateExecution,
  };

  async function orchestrateExecution(
    workflow: Workflow,
    executionId: string,
    events: HistoryStateEvent[],
    baseTime: Date
  ) {
    const executionLogger = logger.createChild({
      persistentLogAttributes: { workflowName: workflow.name, executionId },
    });
    const metrics = initializeMetrics();
    const start = baseTime;
    try {
      // load
      const history = await loadHistory();

      // execute
      const { updatedHistoryEvents, newEvents, resultEvent } =
        await executeWorkflow(history);

      // persist
      await persistWorkflowResult(resultEvent);
      await saveNewEventsToExecutionHistory(newEvents);
      await updateHistory(updatedHistoryEvents);

      // Only log these metrics once the orchestrator has completed successfully.
      logEventMetrics(metrics, events, start);
    } catch (err) {
      executionLogger.error(inspect(err));
      throw err;
    } finally {
      await metrics.flush();
    }

    /**
     * Executes the workflow and returns the history and events to persist.
     */
    async function executeWorkflow(history: HistoryStateEvent[]) {
      // length of time the oldest event in the queue.
      const maxTaskAge = Math.max(
        ...events.map(
          (event) => new Date().getTime() - Date.parse(event.timestamp)
        )
      );
      metrics.putMetric(
        OrchestratorMetrics.MaxTaskAge,
        maxTaskAge,
        Unit.Milliseconds
      );

      return partitionExecutionResults(history, executeWorkflowGenerator());

      async function* executeWorkflowGenerator() {
        yield createEvent<WorkflowTaskStarted>(
          {
            type: WorkflowEventType.WorkflowTaskStarted,
          },
          start
        );

        const workflowContext: WorkflowContext = {
          name: workflow.workflowName,
        };

        const startEvent = history.find(isWorkflowStarted);

        /**
         * Check to see if this is the first run of the workflow (or all others have failed).
         * If so, check to see if the workflow has timeout to start.
         */
        if (!startEvent) {
          const newWorkflowStart = events.find(isWorkflowStarted);

          if (newWorkflowStart?.timeoutTime) {
            metrics.setProperty(OrchestratorMetrics.TimeoutStarted, 1);
            await timed(
              metrics,
              OrchestratorMetrics.TimeoutStartedDuration,
              () =>
                timerClient.scheduleEvent<WorkflowTimedOut>({
                  schedule: Schedule.absolute(newWorkflowStart.timeoutTime!),
                  event: createEvent<WorkflowTimedOut>({
                    type: WorkflowEventType.WorkflowTimedOut,
                  }),
                  executionId,
                })
            );
          } else {
            metrics.setProperty(OrchestratorMetrics.TimeoutStarted, 0);
          }
        }

        const {
          result,
          commands: newCommands,
          history: updatedHistoryEvents,
        } = timedSync(
          metrics,
          OrchestratorMetrics.AdvanceExecutionDuration,
          () => {
            try {
              return progressWorkflow(
                workflow,
                history,
                events,
                workflowContext,
                executionId
              );
            } catch (err) {
              console.log("workflow error");
              executionLogger.error(inspect(err));
              throw err;
            }
          }
        );

        metrics.setProperty(
          OrchestratorMetrics.AdvanceExecutionEvents,
          updatedHistoryEvents.length
        );

        yield* updatedHistoryEvents;

        executionLogger.debug(
          "Workflow terminated with: " + JSON.stringify(result)
        );

        executionLogger.info(`Found ${newCommands.length} new commands.`);

        yield* await timed(
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

        yield createEvent<WorkflowTaskCompleted>({
          type: WorkflowEventType.WorkflowTaskCompleted,
        });

        if (isResult(result)) {
          if (isFailed(result)) {
            const [error, message] = extendsError(result.error)
              ? [result.error.name, result.error.message]
              : ["Error", JSON.stringify(result.error)];
            yield createEvent<WorkflowFailed>({
              type: WorkflowEventType.WorkflowFailed,
              error,
              message,
            });
          } else if (isResolved<any>(result)) {
            yield createEvent<WorkflowCompleted>({
              type: WorkflowEventType.WorkflowCompleted,
              output: result.value,
            });
          }
        }

        return result;
      }

      /**
       * Partitions the events output by the workflow.
       *
       * We need two different collection of events.
       *
       * History Events - these are the events that workflow uses to maintain state.
       *                  each run of the workflow we may filter or add events to this collection.
       *                  these events will be persisted for the next run.
       * Workflow Events - these are fined grained events emitted by the workflow. They drive UIs,
       *                   visualization and debugging. They may not be used in the interpreter.
       *                   The new ones will be persisted after each run.
       */
      async function partitionExecutionResults(
        originalHistory: HistoryStateEvent[],
        executionGenerator: AsyncGenerator<WorkflowEvent, Result | undefined>
      ) {
        const updatedHistoryEvents: HistoryStateEvent[] = [];
        const newWorkflowEvents: WorkflowEvent[] = [];
        let resultEvent: WorkflowCompleted | WorkflowFailed | undefined =
          undefined;
        const seenEvents: Set<string> = new Set(
          originalHistory.map(getEventId)
        );

        for await (const event of executionGenerator) {
          const id = getEventId(event);
          // newWorkflowEvents are the unique new events generated by this workflow execution.
          if (!seenEvents.has(id)) {
            newWorkflowEvents.push(event);
            seenEvents.add(id);
          }
          if (isWorkflowCompleted(event) || isWorkflowFailed(event)) {
            resultEvent = event;
          }
          // updatedHistoryEvents are all HistoryEvents old and new.
          if (isWorkflowStarted(event) || isHistoryEvent(event)) {
            updatedHistoryEvents.push(event);
          }
        }

        return {
          updatedHistoryEvents,
          newEvents: newWorkflowEvents,
          resultEvent,
        };
      }
    }

    async function loadHistory(): Promise<HistoryStateEvent[]> {
      executionLogger.debug("Load history");
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

      return history;
    }

    /**
     * Saves all new events generated by this execution to the {@link ExecutionHistoryClient}.
     */
    async function saveNewEventsToExecutionHistory(newEvents: WorkflowEvent[]) {
      await timed(
        metrics,
        OrchestratorMetrics.AddNewExecutionEventsDuration,
        () => executionHistoryClient.putEvents(executionId, newEvents)
      );

      metrics.setProperty(
        OrchestratorMetrics.NewExecutionEvents,
        newEvents.length
      );
    }

    /**
     * Saves all of the History Events (the ones the workflow uses) to s3.
     *
     * @param updatedHistoryEvents - The previous history plus task events minus any filtered events plus synthetic events.
     * @param commandEvents - events produced by the commands run.
     */
    async function updateHistory(updatedHistoryEvents: HistoryStateEvent[]) {
      console.debug(
        "New history to save",
        JSON.stringify(updatedHistoryEvents)
      );

      // update history from new commands and events
      // for now, we'll just write the awaitable command events to s3 as those are the ones needed to reconstruct the workflow.
      const { bytes: historyUpdatedBytes } = await timed(
        metrics,
        OrchestratorMetrics.SaveHistoryDuration,
        () =>
          workflowRuntimeClient.updateHistory({
            executionId,
            events: updatedHistoryEvents,
          })
      );

      metrics.setProperty(
        OrchestratorMetrics.SavedHistoryEvents,
        updatedHistoryEvents.length
      );
      metrics.putMetric(
        OrchestratorMetrics.SavedHistoryBytes,
        historyUpdatedBytes,
        Unit.Bytes
      );
    }

    async function persistWorkflowResult(
      resultEvent?: WorkflowCompleted | WorkflowFailed
    ) {
      // if the workflow is complete, add success and failure to the commands.
      if (resultEvent) {
        if (isWorkflowFailed(resultEvent)) {
          const execution = await timed(
            metrics,
            OrchestratorMetrics.ExecutionStatusUpdateDuration,
            () =>
              workflowRuntimeClient.failExecution({
                executionId,
                error: resultEvent.error,
                message: resultEvent.message,
              })
          );

          logExecutionCompleteMetrics(execution);
        } else if (isWorkflowCompleted(resultEvent)) {
          const execution = await timed(
            metrics,
            OrchestratorMetrics.ExecutionStatusUpdateDuration,
            () =>
              workflowRuntimeClient.completeExecution({
                executionId,
                result: resultEvent.output,
              })
          );
          logExecutionCompleteMetrics(execution);
        }
      }
    }

    /**
     * Generate events from commands and create a function which will start the commands.
     *
     * Does not actually write the commands out.
     */
    async function processCommands(
      commands: Command[]
    ): Promise<HistoryStateEvent[]> {
      console.debug("Commands to send", JSON.stringify(commands));
      // register command events
      return await Promise.all(
        commands.map((command) =>
          commandExecutor.executeCommand(workflow, executionId, command, start)
        )
      );
    }

    function initializeMetrics() {
      const metrics = metricsClient.createMetricsLogger();
      metricsClient.createMetricsLogger();
      metrics.resetDimensions(false);
      metrics.setNamespace(MetricsCommon.EventualNamespace);
      metrics.setDimensions({
        [MetricsCommon.WorkflowNameDimension]: workflow.workflowName,
      });
      // number of events that came from the workflow task
      metrics.setProperty(OrchestratorMetrics.TaskEvents, events.length);
      // number of workflow tasks that are being processed in the batch (max: 10)
      metrics.setProperty(OrchestratorMetrics.AggregatedTasks, events.length);

      metrics.setProperty(OrchestratorMetrics.ExecutionId, executionId);
      metrics.setProperty(
        OrchestratorMetrics.Version,
        OrchestratorMetrics.VersionV1
      );
      return metrics;
    }

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
  }
}

/** Logs metrics specific to the incoming events */
function logEventMetrics(
  metrics: MetricsLogger,
  events: WorkflowEvent[],
  now: Date
) {
  const sleepCompletedEvents = events.filter(isSleepCompleted);
  if (sleepCompletedEvents.length > 0) {
    const sleepCompletedVariance = sleepCompletedEvents.map(
      (s) => now.getTime() - new Date(s.timestamp).getTime()
    );
    const avg =
      sleepCompletedVariance.reduce((t, n) => t + n, 0) /
      sleepCompletedVariance.length;
    metrics.setProperty(OrchestratorMetrics.SleepVarianceMillis, avg);
  }
}
