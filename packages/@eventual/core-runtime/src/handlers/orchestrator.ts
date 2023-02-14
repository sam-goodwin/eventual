import {
  Context,
  DeterminismError,
  ExecutionID,
  ExecutionStatus,
  FailedExecution,
  generateSyntheticEvents,
  getEventId,
  HistoryEvent,
  HistoryStateEvent,
  isHistoryEvent,
  isHistoryStateEvent,
  isSucceededExecution,
  isTimerCompleted,
  isWorkflowCompletedEvent,
  isWorkflowFailed,
  isWorkflowRunStarted,
  isWorkflowStarted,
  isWorkflowSucceeded,
  LogLevel,
  Schedule,
  SucceededExecution,
  Workflow,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowFailed,
  WorkflowRunCompleted,
  WorkflowRunStarted,
  WorkflowStarted,
  WorkflowSucceeded,
  WorkflowTimedOut,
} from "@eventual/core";
import {
  clearEventualCollector,
  isFailed,
  isResolved,
  isResult,
  normalizeFailedResult,
  Result,
  ServiceType,
  serviceTypeScope,
  WorkflowCommand,
} from "@eventual/core/internal";
import { inspect } from "util";
import { MetricsClient } from "../clients/metrics-client.js";
import { TimerClient } from "../clients/timer-client.js";
import { WorkflowClient } from "../clients/workflow-client.js";
import { CommandExecutor } from "../command-executor.js";
import { hookDate, restoreDate } from "../date-hook.js";
import { isExecutionId, parseWorkflowName } from "../execution.js";
import { interpret } from "../interpret.js";
import { ExecutionLogContext, LogAgent, LogContextType } from "../log-agent.js";
import { MetricsCommon, OrchestratorMetrics } from "../metrics/constants.js";
import { MetricsLogger } from "../metrics/metrics-logger.js";
import { Unit } from "../metrics/unit.js";
import { timed, timedSync } from "../metrics/utils.js";
import { WorkflowProvider } from "../providers/workflow-provider.js";
import { ExecutionHistoryStateStore } from "../stores/execution-history-state-store.js";
import { ExecutionHistoryStore } from "../stores/execution-history-store.js";
import { WorkflowTask } from "../tasks.js";
import { groupBy, promiseAllSettledPartitioned } from "../utils.js";
import { createEvent } from "../workflow-events.js";

/**
 * The Orchestrator's client dependencies.
 */
export interface OrchestratorDependencies {
  executionHistoryStore: ExecutionHistoryStore;
  timerClient: TimerClient;
  workflowClient: WorkflowClient;
  metricsClient: MetricsClient;
  logAgent: LogAgent;
  executionHistoryStateStore: ExecutionHistoryStateStore;
  commandExecutor: CommandExecutor;
  workflowProvider: WorkflowProvider;
  serviceName: string;
}

export interface OrchestratorResult {
  /**
   * IDs of the Executions that failed to orchestrate.
   */
  failedExecutionIds: string[];
}

export interface Orchestrator {
  (
    workflowTasks: WorkflowTask[],
    baseTime?: () => Date
  ): Promise<OrchestratorResult>;
}

/**
 * Creates a generic function for orchestrating a batch of executions
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createOrchestrator({
  commandExecutor,
  executionHistoryStateStore,
  executionHistoryStore,
  logAgent,
  metricsClient,
  serviceName,
  timerClient,
  workflowClient,
  workflowProvider,
}: OrchestratorDependencies): Orchestrator {
  return async (workflowTasks, baseTime = () => new Date()) =>
    await serviceTypeScope(ServiceType.OrchestratorWorker, async () => {
      const tasksByExecutionId = groupBy(
        workflowTasks,
        (task) => task.executionId
      );

      const eventsByExecutionId = Object.fromEntries(
        Object.entries(tasksByExecutionId).map(([executionId, records]) => [
          executionId,
          records.flatMap((e) => {
            return e.events.map((evnt) =>
              // events can be objects or stringified json
              typeof evnt === "string"
                ? (JSON.parse(evnt) as HistoryStateEvent)
                : evnt
            );
          }),
        ])
      );

      console.info(
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
          // TODO: get workflow from execution id
          return orchestrateExecution(
            workflowName,
            executionId,
            records,
            baseTime
          );
        }
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

      return {
        failedExecutionIds: results.rejected.map((rejected) => rejected[0][0]),
      };
    });

  async function orchestrateExecution(
    workflowName: string,
    executionId: ExecutionID,
    events: HistoryStateEvent[],
    baseTime: () => Date
  ) {
    const metrics = initializeMetrics();
    const start = baseTime();

    const executionLogContext: ExecutionLogContext = {
      type: LogContextType.Execution,
      executionId,
    };

    try {
      // load
      const history = await loadHistory();

      // execute
      const {
        updatedHistoryEvents,
        newEvents,
        resultEvent,
        executionCompletedDuringRun,
      } = await executeWorkflow(history);

      // persist
      if (executionCompletedDuringRun && resultEvent) {
        await persistWorkflowResult(resultEvent);
      }
      const logFlush = timed(
        metrics,
        OrchestratorMetrics.ExecutionLogWriteDuration,
        // write any collected logs to cloudwatch
        () => logAgent.flush()
      );
      // We must save events to the events table and then s3 in sequence.
      // If the event write fails, but s3 succeeds, the events will never be re-generated.
      await saveNewEventsToExecutionHistory(newEvents);
      await updateHistory(updatedHistoryEvents);
      await logFlush;

      // Only log these metrics once the orchestrator has completed successfully.
      logEventMetrics(metrics, events, start);
    } catch (err) {
      console.error(inspect(err));
      logAgent.logWithContext(
        { type: LogContextType.Execution, executionId },
        LogLevel.DEBUG,
        "orchestrator error",
        inspect(err)
      );
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
          (event) => baseTime().getTime() - Date.parse(event.timestamp)
        )
      );
      metrics.putMetric(
        OrchestratorMetrics.MaxTaskAge,
        maxTaskAge,
        Unit.Milliseconds
      );

      let executionCompletedDuringRun = false;

      return {
        ...(await partitionExecutionResults(
          history,
          executeWorkflowGenerator()
        )),
        executionCompletedDuringRun,
      };

      async function* executeWorkflowGenerator() {
        const runStarted = createEvent<WorkflowRunStarted>(
          {
            type: WorkflowEventType.WorkflowRunStarted,
          },
          start
        );

        const workflow = workflowProvider.lookupWorkflow(workflowName);
        if (workflow === undefined) {
          yield runStarted;
          yield createEvent<WorkflowFailed>(
            {
              type: WorkflowEventType.WorkflowFailed,
              error: "WorkflowNotFound",
              message: `Workflow name ${workflowName} does not exist.`,
            },
            start
          );
          return;
        }

        const processedEvents = processEvents(
          history,
          [runStarted, ...events],
          baseTime()
        );

        /**
         * If this is the first run check to see if the workflow has timeout to start.
         */
        if (processedEvents.isFirstRun) {
          metrics.setProperty(OrchestratorMetrics.ExecutionStarted, 1);
          metrics.setProperty(
            OrchestratorMetrics.ExecutionStartedDuration,
            baseTime().getTime() -
              new Date(processedEvents.startEvent.timestamp).getTime()
          );
          if (processedEvents.startEvent.timeoutTime) {
            const timeoutTime = processedEvents.startEvent.timeoutTime;
            metrics.setProperty(OrchestratorMetrics.TimeoutStarted, 1);
            await timed(
              metrics,
              OrchestratorMetrics.TimeoutStartedDuration,
              () =>
                timerClient.scheduleEvent<WorkflowTimedOut>({
                  schedule: Schedule.time(timeoutTime),
                  event: createEvent<WorkflowTimedOut>(
                    {
                      type: WorkflowEventType.WorkflowTimedOut,
                    },
                    start
                  ),
                  executionId,
                })
            );
          } else {
            metrics.setProperty(OrchestratorMetrics.TimeoutStarted, 0);
          }
        }

        const { result, commands: newCommands } = logAgent.logContextScopeSync(
          executionLogContext,
          () => {
            console.debug("history events", JSON.stringify(history));
            console.debug("task events", JSON.stringify(events));
            console.debug(
              "synthetic events",
              JSON.stringify(processedEvents.syntheticEvents)
            );
            console.debug(
              "interpret events",
              JSON.stringify(processedEvents.interpretEvents)
            );

            return timedSync(
              metrics,
              OrchestratorMetrics.AdvanceExecutionDuration,
              () =>
                progressWorkflow(
                  executionId,
                  workflow,
                  processedEvents,
                  logAgent
                )
            );
          }
        );

        metrics.setProperty(
          OrchestratorMetrics.AdvanceExecutionEvents,
          processedEvents.allEvents.length
        );

        yield* processedEvents.allEvents;

        logAgent.logWithContext(
          executionLogContext,
          LogLevel.DEBUG,
          result
            ? "Workflow returned a result with: " + JSON.stringify(result)
            : "Workflow did not return a result."
        );
        logAgent.logWithContext(
          executionLogContext,
          LogLevel.DEBUG,
          `Found ${newCommands.length} new commands. ${JSON.stringify(
            newCommands
          )}`
        );

        yield* await timed(
          metrics,
          OrchestratorMetrics.InvokeCommandsDuration,
          () => processCommands(workflow, newCommands)
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

        yield createEvent<WorkflowRunCompleted>(
          {
            type: WorkflowEventType.WorkflowRunCompleted,
          },
          start
        );

        if (!processedEvents.completedEvent && isResult(result)) {
          if (isFailed(result)) {
            const { error, message } = normalizeFailedResult(result);
            yield createEvent<WorkflowFailed>(
              {
                type: WorkflowEventType.WorkflowFailed,
                error,
                message,
              },
              start
            );
            executionCompletedDuringRun = true;
          } else if (isResolved(result)) {
            yield createEvent<WorkflowSucceeded>(
              {
                type: WorkflowEventType.WorkflowSucceeded,
                output: result.value,
              },
              start
            );
            executionCompletedDuringRun = true;
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
        let resultEvent: WorkflowSucceeded | WorkflowFailed | undefined;
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
          if (isWorkflowCompletedEvent(event)) {
            resultEvent = event;
          }
          // updatedHistoryEvents are all HistoryEvents old and new.
          if (isHistoryStateEvent(event)) {
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
      logAgent.logWithContext(
        executionLogContext,
        LogLevel.DEBUG,
        "Load history"
      );
      // load history
      const history = await timed(
        metrics,
        OrchestratorMetrics.LoadHistoryDuration,
        async () => executionHistoryStateStore.getHistory(executionId)
      );

      metrics.setProperty(
        OrchestratorMetrics.LoadedHistoryEvents,
        history.length
      );

      return history;
    }

    /**
     * Saves all new events generated by this execution to the {@link ExecutionHistoryStore}.
     */
    async function saveNewEventsToExecutionHistory(newEvents: WorkflowEvent[]) {
      await timed(
        metrics,
        OrchestratorMetrics.AddNewExecutionEventsDuration,
        () => executionHistoryStore.putEvents(executionId, newEvents)
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
          executionHistoryStateStore.updateHistory({
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
      resultEvent: WorkflowSucceeded | WorkflowFailed
    ) {
      // if the workflow is complete, add success and failure to the commands.
      if (isWorkflowFailed(resultEvent)) {
        const execution = await timed(
          metrics,
          OrchestratorMetrics.ExecutionStatusUpdateDuration,
          () =>
            workflowClient.failExecution({
              executionId,
              error: resultEvent.error,
              message: resultEvent.message,
              endTime: baseTime().toISOString(),
            })
        );

        logAgent.logWithContext(
          { executionId, type: LogContextType.Execution },
          LogLevel.INFO,
          "Workflow Failed",
          `${resultEvent.error}: ${resultEvent.message}`
        );

        logExecutionCompleteMetrics(execution);
      } else if (isWorkflowSucceeded(resultEvent)) {
        const execution = await timed(
          metrics,
          OrchestratorMetrics.ExecutionStatusUpdateDuration,
          () =>
            workflowClient.succeedExecution({
              executionId,
              result: resultEvent.output,
              endTime: baseTime().toISOString(),
            })
        );

        logAgent.logWithContext(
          { executionId, type: LogContextType.Execution },
          LogLevel.INFO,
          "Workflow Succeeded",
          resultEvent.output
        );

        logExecutionCompleteMetrics(execution);
      }
    }

    /**
     * Generate events from commands and create a function which will start the commands.
     *
     * Does not actually write the commands out.
     */
    async function processCommands(
      workflow: Workflow,
      commands: WorkflowCommand[]
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
        [MetricsCommon.ServiceNameDimension]: serviceName,
      });
      metrics.setProperty(MetricsCommon.WorkflowName, workflowName);
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
      execution: SucceededExecution | FailedExecution
    ) {
      metrics.setProperty(OrchestratorMetrics.ExecutionCompleted, 1);
      metrics.putMetric(
        OrchestratorMetrics.ExecutionSucceeded,
        execution.status === ExecutionStatus.SUCCEEDED ? 1 : 0,
        Unit.Count
      );
      metrics.putMetric(
        OrchestratorMetrics.ExecutionFailed,
        execution.status === ExecutionStatus.SUCCEEDED ? 0 : 1,
        Unit.Count
      );
      metrics.putMetric(
        OrchestratorMetrics.ExecutionTotalDuration,
        new Date(execution.endTime).getTime() -
          new Date(execution.startTime).getTime()
      );
      if (isSucceededExecution(execution)) {
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
  const timerCompletedEvents = events.filter(isTimerCompleted);
  if (timerCompletedEvents.length > 0) {
    const timerCompletedVariance = timerCompletedEvents.map(
      (s) => now.getTime() - new Date(s.timestamp).getTime()
    );
    const avg =
      timerCompletedVariance.reduce((t, n) => t + n, 0) /
      timerCompletedVariance.length;
    metrics.setProperty(OrchestratorMetrics.TimerVarianceMillis, avg);
  }
}

export function progressWorkflow(
  executionId: string,
  workflow: Workflow,
  processedEvents: ProcessEventsResult,
  logAgent?: LogAgent
) {
  // flush any logs generated to this point
  const logCheckpoint = logAgent?.getCheckpoint();

  // buffer logs until interpret is complete - don't want to send logs we might clear
  logAgent?.disableSendingLogs();

  const context: Context = {
    workflow: {
      name: workflow.workflowName,
    },
    execution: {
      ...processedEvents.startEvent.context,
      id: executionId,
      startTime: processedEvents.startEvent.timestamp,
    },
  };

  try {
    let currentTime = new Date(
      processedEvents.firstRunStarted.timestamp
    ).getTime();
    hookDate(() => currentTime);
    return interpret(
      workflow.definition(processedEvents.startEvent.input, context),
      processedEvents.interpretEvents,
      {
        hooks: {
          /**
           * Invoked for each {@link HistoryResultEvent}, or an event which
           * represents the resolution of some {@link Eventual}.
           *
           * We use this to watch for the application of the {@link WorkflowRunStarted} event.
           * Which we use to find and apply the current time to the hooked {@link Date} object.
           */
          beforeApplyingResultEvent: (event) => {
            if (isWorkflowRunStarted(event)) {
              currentTime = new Date(event.timestamp).getTime();
            }
          },
          // when an event is matched, that means all the work to this point has been completed, clear the logs collected.
          // this implements "exactly once" logs with the workflow semantics.
          historicalEventMatched: () => logAgent?.clearLogs(logCheckpoint),
        },
      }
    );
  } catch (err) {
    // temporary fix when the interpreter fails, but the activities are not cleared.
    clearEventualCollector();
    console.debug("workflow error", inspect(err));
    throw err;
  } finally {
    // re-enable sending logs, any generated logs are new.
    restoreDate();
    logAgent?.enableSendingLogs();
  }
}

export interface ProcessEventsResult {
  syntheticEvents: HistoryStateEvent[];
  interpretEvents: HistoryEvent[];
  allEvents: HistoryStateEvent[];
  startEvent: WorkflowStarted;
  completedEvent?: WorkflowSucceeded | WorkflowFailed;
  firstRunStarted: WorkflowRunStarted;
  isFirstRun: boolean;
}

export function processEvents(
  historyEvents: HistoryStateEvent[],
  taskEvents: HistoryStateEvent[],
  baseTime: Date
): ProcessEventsResult {
  // historical events and incoming events will be fed into the workflow to resume/progress state
  const uniqueTaskEvents = filterEvents<HistoryStateEvent>(
    historyEvents,
    taskEvents
  );

  // mutating array to avoid performance hit of spread later.
  const allEvents: HistoryStateEvent[] = [
    ...historyEvents,
    ...uniqueTaskEvents,
  ];
  // Generates events that are time sensitive, like timer completed events.
  const syntheticEvents = generateSyntheticEvents(allEvents, baseTime);
  allEvents.push(...syntheticEvents);

  const historicalStartEvent = historyEvents.find(isWorkflowStarted);
  const startEvent =
    historicalStartEvent ?? uniqueTaskEvents.find(isWorkflowStarted);

  if (!startEvent) {
    throw new DeterminismError(
      `No ${WorkflowEventType.WorkflowStarted} found.`
    );
  }

  const firstRunStarted = allEvents.find(isWorkflowRunStarted);

  if (!firstRunStarted) {
    throw new DeterminismError(
      `No ${WorkflowEventType.WorkflowRunStarted} found.`
    );
  }

  return {
    interpretEvents: allEvents.filter(isHistoryEvent),
    startEvent,
    isFirstRun: !historicalStartEvent,
    completedEvent: allEvents.find(isWorkflowCompletedEvent),
    syntheticEvents,
    allEvents,
    firstRunStarted,
  };
}

/**
 * Filters out events that are also present in origin events.
 *
 * Events are taken only if their ID ({@link getEventId}) is unique across all other events.
 */
export function filterEvents<T extends WorkflowEvent>(
  originEvents: T[],
  events: T[]
): T[] {
  const ids = new Set(originEvents.map(getEventId));

  return events.filter((event) => {
    const id = getEventId(event);
    if (ids.has(id)) {
      return false;
    }
    ids.add(id);
    return true;
  });
}
