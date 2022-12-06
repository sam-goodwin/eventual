import { inspect } from "util";
import {
  Command,
  isScheduleActivityCommand,
  isScheduleWorkflowCommand,
  isSleepForCommand,
  isSleepUntilCommand,
  isExpectSignalCommand,
  isSendSignalCommand,
  isStartConditionCommand,
} from "../../command.js";
import { WorkflowContext } from "../../context.js";
import {
  ActivityScheduled,
  ChildWorkflowScheduled,
  ConditionStarted,
  ConditionTimedOut,
  createEvent,
  HistoryStateEvent,
  isSleepCompleted,
  SignalSent,
  WorkflowCompleted,
  WorkflowEvent,
  WorkflowEventType,
  WorkflowFailed,
  WorkflowTaskCompleted,
  WorkflowTaskStarted,
} from "../../events.js";
import {
  CompleteExecution,
  FailedExecution,
  ExecutionStatus,
  isCompleteExecution,
} from "../../execution.js";
import { isChildExecutionTarget } from "../../index.js";
import { isFailed, isResolved, isResult } from "../../result.js";
import { assertNever } from "../../util.js";
import { lookupWorkflow, progressWorkflow, Workflow } from "../../workflow.js";

import {
  formatExecutionId,
  isExecutionId,
  parseWorkflowName,
} from "../execution-id.js";
import { MetricsCommon, OrchestratorMetrics } from "../metrics/constants.js";
import { MetricsLogger } from "../metrics/metrics-logger.js";
import { Unit } from "../metrics/unit.js";
import { timed, timedSync } from "../metrics/utils.js";
import {
  formatChildExecutionName,
  promiseAllSettledPartitioned,
} from "../utils.js";
import type {
  ExecutionHistoryClient,
  TimerClient,
  MetricsClient,
  LoggerClient,
  WorkflowClient,
  WorkflowRuntimeClient,
} from "../clients/index.js";
import { TimerRequestType } from "../clients/timer-client.js";

export interface OrchestratorResult {
  failedExecutionIds: string[];
}

export function createOrchestrator(
  executionHistoryClient: ExecutionHistoryClient,
  timerClient: TimerClient,
  workflowRuntimeClient: WorkflowRuntimeClient,
  workflowClient: WorkflowClient,
  metricsClient: MetricsClient,
  loggerClient: LoggerClient
): (
  eventsByExecutionId: Record<string, HistoryStateEvent[]>
) => Promise<OrchestratorResult> {
  const logger = loggerClient.getLogger();

  return async (eventsByExecutionId) => {
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
        return orchestrateExecution(workflow, executionId, records);
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
  };

  async function orchestrateExecution(
    workflow: Workflow,
    executionId: string,
    events: HistoryStateEvent[]
  ) {
    const executionLogger = logger.createChild({
      persistentLogAttributes: { workflowName: workflow.name, executionId },
    });
    const metrics = metricsClient.createMetricsLogger();
    metrics.resetDimensions(false);
    metrics.setNamespace(MetricsCommon.EventualNamespace);
    metrics.setDimensions({
      [MetricsCommon.WorkflowNameDimension]: workflow.workflowName,
    });
    const start = new Date();
    try {
      // number of events that came from the workflow task
      metrics.setProperty(OrchestratorMetrics.TaskEvents, events.length);
      // number of workflow tasks that are being processed in the batch (max: 10)
      metrics.setProperty(OrchestratorMetrics.AggregatedTasks, events.length);

      /** Events to be written to the history table at the end of the workflow task */
      const newEvents: WorkflowEvent[] = [];

      metrics.setProperty(OrchestratorMetrics.ExecutionId, executionId);
      metrics.setProperty(
        OrchestratorMetrics.Version,
        OrchestratorMetrics.VersionV1
      );
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

      newEvents.push(
        createEvent<WorkflowTaskStarted>(
          {
            type: WorkflowEventType.WorkflowTaskStarted,
          },
          start
        )
      );

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

      const workflowContext: WorkflowContext = {
        name: workflow.workflowName,
      };

      const {
        result,
        commands: newCommands,
        history: updatedHistory,
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
        updatedHistory.length
      );

      executionLogger.debug(
        "Workflow terminated with: " + JSON.stringify(result)
      );

      executionLogger.info(`Found ${newCommands.length} new commands.`);

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

      console.debug("New history to save", JSON.stringify(newHistoryEvents));

      // update history from new commands and events
      // for now, we'll just write the awaitable command events to s3 as those are the ones needed to reconstruct the workflow.
      const { bytes: historyUpdatedBytes } = await timed(
        metrics,
        OrchestratorMetrics.SaveHistoryDuration,
        () =>
          workflowRuntimeClient.updateHistory({
            executionId,
            events: newHistoryEvents,
          })
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
            () =>
              workflowRuntimeClient.failExecution({
                executionId,
                error,
                message,
              })
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
              workflowRuntimeClient.completeExecution({
                executionId,
                result: result.value,
              })
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

      // Only log these metrics once the orchestrator has completed successfully.
      logEventMetrics(metrics, events, start);

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
          commands.map(async (command) => {
            if (isScheduleActivityCommand(command)) {
              await workflowRuntimeClient.scheduleActivity({
                workflowName: workflow.workflowName,
                executionId,
                command,
              });

              return createEvent<ActivityScheduled>({
                type: WorkflowEventType.ActivityScheduled,
                seq: command.seq,
                name: command.name,
              });
            } else if (isScheduleWorkflowCommand(command)) {
              await workflowClient.startWorkflow({
                workflowName: command.name,
                input: command.input,
                parentExecutionId: executionId,
                executionName: formatChildExecutionName(
                  executionId,
                  command.seq
                ),
                seq: command.seq,
              });

              return createEvent<ChildWorkflowScheduled>({
                type: WorkflowEventType.ChildWorkflowScheduled,
                seq: command.seq,
                name: command.name,
                input: command.input,
              });
            } else if (
              isSleepForCommand(command) ||
              isSleepUntilCommand(command)
            ) {
              // all sleep times are computed using the start time of the WorkflowTaskStarted
              return workflowRuntimeClient.scheduleSleep({
                executionId,
                command,
                baseTime: start,
              });
            } else if (isExpectSignalCommand(command)) {
              // should the timeout command be generic (ex: StartTimeout) or specific (ex: ExpectSignal)?
              return workflowRuntimeClient.executionExpectSignal({
                executionId,
                command,
                baseTime: start,
              });
            } else if (isSendSignalCommand(command)) {
              const childExecutionId = isChildExecutionTarget(command.target)
                ? formatExecutionId(
                    command.target.workflowName,
                    formatChildExecutionName(executionId, command.target.seq)
                  )
                : command.target.executionId;

              await workflowClient.sendSignal({
                signal: command.signalId,
                executionId: childExecutionId,
                id: `${executionId}/${command.seq}`,
                payload: command.payload,
              });

              return createEvent<SignalSent>({
                type: WorkflowEventType.SignalSent,
                executionId: childExecutionId,
                seq: command.seq,
                signalId: command.signalId,
                payload: command.payload,
              });
            } else if (isStartConditionCommand(command)) {
              if (command.timeoutSeconds) {
                await timerClient.startTimer({
                  type: TimerRequestType.ForwardEvent,
                  event: createEvent<ConditionTimedOut>({
                    type: WorkflowEventType.ConditionTimedOut,
                    seq: command.seq,
                  }),
                  executionId,
                  untilTime: new Date(
                    start.getTime() + command.timeoutSeconds * 1000
                  ).toISOString(),
                });
              }

              return createEvent<ConditionStarted>({
                type: WorkflowEventType.ConditionStarted,
                seq: command.seq!,
              });
            } else {
              return assertNever(command, `unknown command type`);
            }
          })
        );
      }
    } catch (err) {
      executionLogger.error(inspect(err));
      throw err;
    } finally {
      await metrics.flush();
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
