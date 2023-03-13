import {
  ExecutionID,
  ExecutionStatus,
  FailedExecution,
  isSucceededExecution,
  LogLevel,
  Schedule,
  SucceededExecution,
  Workflow,
} from "@eventual/core";
import {
  events,
  HistoryStateEvent,
  isTimerCompleted,
  isTimerScheduled,
  isWorkflowRunStarted,
  isWorkflowStarted,
  Result,
  ServiceType,
  serviceTypeScope,
  TimerCompleted,
  TimerScheduled,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowFailed,
  WorkflowInputEvent,
  WorkflowRunStarted,
  WorkflowStarted,
  WorkflowSucceeded,
  WorkflowTimedOut,
} from "@eventual/core/internal";
import { inspect } from "util";
import type { TimerClient } from "../clients/timer-client.js";
import type { WorkflowClient } from "../clients/workflow-client.js";
import type { CommandExecutor } from "../command-executor.js";
import { hookConsole, restoreConsole } from "../console-hook.js";
import { hookDate, restoreDate } from "../date-hook.js";
import {
  MetricsClient,
  MetricsCommon,
  MetricsLogger,
  OrchestratorMetrics,
} from "../index.js";
import { ExecutionLogContext, LogAgent, LogContextType } from "../log-agent.js";
import { Unit } from "../metrics/unit.js";
import { timed } from "../metrics/utils.js";
import type { ExecutorProvider } from "../providers/executor-provider.js";
import type { WorkflowProvider } from "../providers/workflow-provider.js";
import { isFailed, normalizeFailedResult } from "../result.js";
import type { ExecutionHistoryStore } from "../stores/execution-history-store.js";
import { createEvent } from "../workflow-events.js";
import { WorkflowExecutor, WorkflowResult } from "../workflow-executor.js";
import { Orchestrator, runExecutions } from "./orchestrator.js";

export function createLocalOrchestrator(
  deps: OrchestrateDependencies
): Orchestrator {
  return (workflowTasks, baseTime = () => new Date()) => {
    return serviceTypeScope(ServiceType.OrchestratorWorker, async () => {
      console.log(workflowTasks);
      const result = await runExecutions(
        workflowTasks,
        (workflowName, executionId, events) => {
          return orchestrateExecution(
            workflowName,
            executionId,
            events,
            baseTime(),
            {
              ...deps,
            }
          );
        }
      );
      console.log(result);

      // ensure all of the logs have been sent.
      await deps.logAgent?.flush();

      return {
        failedExecutionIds: Object.keys(result.failedExecutions),
      };
    });
  };
}

interface OrchestrateDependencies {
  commandExecutor: CommandExecutor;
  executionHistoryStore: ExecutionHistoryStore;
  executorProvider: ExecutorProvider<ExecutorContext>;
  logAgent?: LogAgent;
  metricsClient?: MetricsClient;
  serviceName: string;
  timerClient: TimerClient;
  workflowClient: WorkflowClient;
  workflowProvider: WorkflowProvider;
}

export interface ExecutorContext {
  date: number;
}

export async function orchestrateExecution(
  workflowName: string,
  executionId: ExecutionID,
  events: WorkflowInputEvent[],
  executionTime: Date,
  deps: OrchestrateDependencies
) {
  const metrics = initializeMetrics(
    deps.serviceName,
    workflowName,
    executionId,
    deps.metricsClient
  );
  const executionLogContext: ExecutionLogContext = {
    type: LogContextType.Execution,
    executionId,
  };
  try {
    // get the workflow
    const workflow = deps.workflowProvider.lookupWorkflow(workflowName);

    deps.logAgent?.logWithContext(
      executionLogContext,
      LogLevel.DEBUG,
      "Incoming Events",
      JSON.stringify(events)
    );

    const maxTaskAge = recordEventMetrics(metrics, events, executionTime);

    // if it is the first execution, record metrics for and start the timeout if configured
    await tryHandleFirstExecution(
      events,
      executionTime,
      executionId,
      deps.timerClient,
      metrics
    );

    const runStarted = createEvent<WorkflowRunStarted>(
      {
        type: WorkflowEventType.WorkflowRunStarted,
      },
      executionTime
    );

    // start event collection
    const { commandEvents, executor, flushPromise } = await eventCollectorScope(
      executionId,
      deps.executionHistoryStore,
      metrics,
      async (emitEvent) => {
        emitEvent(runStarted);

        // workflow could not be loaded, mark the workflow as failed and exit
        if (!workflow) {
          const error = new Error("Workflow not found");
          // mark the workflow as failed
          // emit the result event
          emitEvent(
            await persistWorkflowResult(Result.failed(error), executionTime)
          );
          return {};
        }

        // get the persisted or new instance of the executor
        const executor = await getExecutor(
          workflow,
          executionId,
          executionTime,
          deps.logAgent
        );
        const hasPreviousResult = !!executor.result;

        hookDate(() => executor.executionContext.date);
        if (deps.logAgent) {
          hookConsole((level, data) =>
            deps.logAgent?.logWithContext(executionLogContext, level, ...data)
          );
        }

        deps.logAgent?.disableSendingLogs();

        const { commands, result } = await timed(
          metrics,
          OrchestratorMetrics.AdvanceExecutionDuration,
          () =>
            runExecutor(runStarted, events, executor, executionTime).finally(
              () => {
                restoreDate();
                restoreConsole();
                deps.logAgent?.enableSendingLogs();
              }
            )
        );

        metrics?.setProperty(
          OrchestratorMetrics.AdvanceExecutionEvents,
          executor.history.length
        );

        deps.logAgent?.logWithContext(
          executionLogContext,
          LogLevel.DEBUG,
          result
            ? "Workflow returned a result with: " + JSON.stringify(result)
            : "Workflow did not return a result."
        );
        deps.logAgent?.logWithContext(
          executionLogContext,
          LogLevel.DEBUG,
          `Found ${commands.length} new commands. ${JSON.stringify(commands)}`
        );

        // try to execute all commands
        const commandEvents = await timed(
          metrics,
          OrchestratorMetrics.InvokeCommandsDuration,
          () =>
            Promise.all(
              commands.map((command) =>
                deps.commandExecutor.executeCommand(
                  workflow,
                  executionId,
                  command,
                  executionTime
                )
              )
            )
        );

        metrics?.putMetric(
          OrchestratorMetrics.CommandsInvoked,
          commands.length,
          Unit.Count
        );

        // register command events
        emitEvent(...commandEvents);

        // only persist results when the result is new in this run
        if (result && !hasPreviousResult) {
          emitEvent(await persistWorkflowResult(result, executionTime));
        }
        emitEvent(
          createEvent(
            { type: WorkflowEventType.WorkflowRunCompleted },
            executionTime
          )
        );

        return {
          commandEvents,
          executor,
          flushPromise: timed(
            metrics,
            OrchestratorMetrics.ExecutionLogWriteDuration,
            // write any collected logs to cloudwatch
            () => deps.logAgent?.flush()
          ),
        };
      }
    );

    if (maxTaskAge) {
      // tracks the time it takes for a workflow task to be scheduled until new commands could be emitted.
      // This represent the workflow orchestration time of User Perceived Latency
      // Average expected time for an activity to be invoked until it is considered complete by the workflow should follow:
      // AvgActivityDuration(N) = Avg(TimeToCommandsInvoked) + Avg(ActivityDuration(N))
      metrics?.putMetric(
        OrchestratorMetrics.TimeToCommandsInvoked,
        maxTaskAge + (new Date().getTime() - executionTime.getTime())
      );
    }

    if (executor) {
      await persistExecutor(executor, [runStarted, ...commandEvents]);
    }

    await flushPromise;
  } catch (err) {
    console.error(inspect(err));
    deps.logAgent?.logWithContext(
      executionLogContext,
      LogLevel.DEBUG,
      "orchestrator error",
      inspect(err)
    );
    throw err;
  } finally {
    metrics?.flush();
  }

  /**
   * Retrieves the previously started executor or creates a new one and starts it.
   */
  async function getExecutor(
    workflow: Workflow<any, any>,
    executionId: string,
    executionTime: Date,
    logAgent?: LogAgent
  ): Promise<WorkflowExecutor<any, any, ExecutorContext>> {
    logAgent?.logWithContext(
      { type: LogContextType.Execution, executionId },
      LogLevel.DEBUG,
      "Retrieve Executor"
    );

    return await timed(metrics, OrchestratorMetrics.LoadHistoryDuration, () =>
      deps.executorProvider.getExecutor(executionId, (history) => {
        deps.logAgent?.logWithContext(
          executionLogContext,
          LogLevel.DEBUG,
          "History Events",
          JSON.stringify(history)
        );

        metrics?.setProperty(
          OrchestratorMetrics.LoadedHistoryEvents,
          history.length
        );

        const logCheckpoint = logAgent?.getCheckpoint();

        return new WorkflowExecutor(
          workflow,
          history,
          { date: executionTime.getTime() },
          {
            hooks: {
              beforeApplyingResultEvent: (event, context) => {
                if (isWorkflowRunStarted(event)) {
                  context.date = new Date(event.timestamp).getTime();
                }
              },
              historicalEventMatched: () => {
                logAgent?.clearLogs(logCheckpoint);
              },
            },
          }
        );
      })
    );
  }

  async function persistWorkflowResult(
    result: Result,
    executionTime: Date
  ): Promise<WorkflowSucceeded | WorkflowFailed> {
    if (isFailed(result)) {
      const normalizedError = normalizeFailedResult(result);
      logExecutionCompleteMetrics(
        await deps.workflowClient.failExecution({
          endTime: executionTime.toISOString(),
          executionId,
          ...normalizedError,
        }),
        metrics
      );
      deps.logAgent?.logWithContext(
        executionLogContext,
        LogLevel.INFO,
        "Workflow Failed",
        `${normalizedError.error}: ${normalizedError.message}`
      );
      return createEvent<WorkflowFailed>(
        {
          type: WorkflowEventType.WorkflowFailed,
          ...normalizedError,
        },
        executionTime
      );
    } else {
      logExecutionCompleteMetrics(
        await deps.workflowClient.succeedExecution({
          endTime: executionTime.toISOString(),
          executionId,
          result: result.value,
        }),
        metrics
      );
      deps.logAgent?.logWithContext(
        executionLogContext,
        LogLevel.INFO,
        "Workflow Succeeded",
        JSON.stringify(result.value, undefined, 4)
      );
      return createEvent<WorkflowSucceeded>(
        {
          type: WorkflowEventType.WorkflowSucceeded,
          output: result.value,
        },
        executionTime
      );
    }
  }

  async function persistExecutor(
    executor: WorkflowExecutor<any, any, any>,
    newEvents: HistoryStateEvent[]
  ) {
    const { storedBytes } = await timed(
      metrics,
      OrchestratorMetrics.SaveHistoryDuration,
      () =>
        deps.executorProvider.persistExecution(executionId, newEvents, executor)
    );
    metrics?.setProperty(
      OrchestratorMetrics.SavedHistoryEvents,
      executor.history.length + newEvents.length
    );
    metrics?.putMetric(
      OrchestratorMetrics.SavedHistoryBytes,
      storedBytes,
      Unit.Bytes
    );
  }
}

async function runExecutor(
  workflowRunStartedEvent: WorkflowRunStarted,
  events: WorkflowInputEvent[],
  workflowExecutor: WorkflowExecutor<any, any, ExecutorContext>,
  executionTime: Date
) {
  // when this is the first time the workflow has been run, the workflow started event will be emitted as well.
  let workflowResult: WorkflowResult | undefined = undefined;
  // if the executor has not been started, try to start it.
  if (!workflowExecutor.isStarted()) {
    workflowResult = await workflowExecutor.start(events);
  } else {
    // run the workflow with the new events
    workflowResult = await workflowExecutor.continue(
      workflowRunStartedEvent,
      ...events.filter(
        (event): event is Exclude<typeof event, WorkflowStarted> =>
          !isWorkflowStarted(event)
      )
    );
  }

  /**
   * If the workflow has any active timers that can be completed, complete them now
   * and continue the workflow.
   */
  const syntheticTimerEvents = generateSyntheticTimerEvents(
    workflowExecutor,
    executionTime
  );

  const syntheticEventsResult =
    syntheticTimerEvents.length > 0
      ? await workflowExecutor.continue(...syntheticTimerEvents)
      : undefined;

  // merge the start and continue commands and then return.
  return {
    commands: [
      ...workflowResult.commands,
      ...(syntheticEventsResult?.commands ?? []),
    ],
    result: syntheticEventsResult?.result ?? workflowResult.result,
  };
}

function generateSyntheticTimerEvents(
  executor: WorkflowExecutor<any, any, any>,
  executionTime: Date
) {
  if (!executor.hasActiveEventuals) {
    return [];
  }
  const events = executor.history;
  const activeCompleteTimerEvents = events.filter(
    (event): event is TimerScheduled =>
      isTimerScheduled(event) &&
      executor.isEventualActive(event.seq) &&
      new Date(event.timestamp).getTime() <= executionTime.getTime()
  );
  return activeCompleteTimerEvents.map((event) =>
    createEvent<TimerCompleted>(
      { type: WorkflowEventType.TimerCompleted, seq: event.seq },
      executionTime
    )
  );
}

async function eventCollectorScope<T>(
  executionId: ExecutionID,
  eventStore: ExecutionHistoryStore,
  metrics: MetricsLogger | undefined,
  executor: (
    emitEvent: (...events: WorkflowEvent[]) => void
  ) => Promise<Awaited<T>>
) {
  const events: WorkflowEvent[][] = [];
  const result = await executor((..._events: WorkflowEvent[]) => {
    events.push(_events);
  });
  const newEvents = events.flat();
  await timed(metrics, OrchestratorMetrics.AddNewExecutionEventsDuration, () =>
    eventStore.putEvents(executionId, newEvents)
  );
  metrics?.setProperty(
    OrchestratorMetrics.NewExecutionEvents,
    newEvents.length
  );
  return result;
}

async function tryHandleFirstExecution(
  events: WorkflowInputEvent[],
  executionTime: Date,
  executionId: string,
  timerClient: TimerClient,
  metrics?: MetricsLogger
) {
  const startEvent = events.find(isWorkflowStarted);

  if (startEvent) {
    metrics?.setProperty(OrchestratorMetrics.ExecutionStarted, 1);
    metrics?.setProperty(
      OrchestratorMetrics.ExecutionStartedDuration,
      executionTime.getTime() - new Date(startEvent.timestamp).getTime()
    );
    // if this is the first run, there will be a start event.
    // if there is a timeout, start it
    if (startEvent.timeoutTime) {
      const timeout = startEvent.timeoutTime;
      metrics?.setProperty(OrchestratorMetrics.TimeoutStarted, 1);
      // if the start event is new in this execution and had a timeout, start it
      await timed(metrics, OrchestratorMetrics.TimeoutStartedDuration, () =>
        timerClient.scheduleEvent<WorkflowTimedOut>({
          schedule: Schedule.time(timeout),
          event: createEvent<WorkflowTimedOut>(
            {
              type: WorkflowEventType.WorkflowTimedOut,
            },
            new Date(timeout)
          ),
          executionId,
        })
      );
    } else {
      metrics?.setProperty(OrchestratorMetrics.TimeoutStarted, 0);
    }
  }
}

function initializeMetrics(
  serviceName: string,
  workflowName: string,
  executionId: string,
  metricsClient?: MetricsClient
) {
  if (metricsClient) {
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
  return undefined;
}

/** Logs metrics specific to the incoming events */
function recordEventMetrics(
  metrics: MetricsLogger | undefined,
  events: WorkflowEvent[],
  now: Date
) {
  if (metrics) {
    // length of time the oldest event in the queue.
    const maxTaskAge = Math.max(
      ...events.map((event) => now.getTime() - Date.parse(event.timestamp))
    );
    metrics.putMetric(
      OrchestratorMetrics.MaxTaskAge,
      maxTaskAge,
      Unit.Milliseconds
    );

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

    return maxTaskAge;
  }
  return undefined;
}

function logExecutionCompleteMetrics(
  execution: SucceededExecution | FailedExecution,
  metrics?: MetricsLogger
) {
  if (metrics) {
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
