import {
  ActivityFailed,
  ActivityNotFoundError,
  ActivitySucceeded,
  ActivityWorkerRequest,
  clearActivityContext,
  createEvent,
  EventualServiceClient,
  extendsError,
  isAsyncResult,
  isWorkflowFailed,
  LogLevel,
  registerServiceClient,
  ServiceType,
  serviceTypeScope,
  setActivityContext,
  WorkflowEventType,
} from "@eventual/core";
import { createActivityToken } from "../activity-token.js";
import { EventClient } from "../clients/event-client.js";
import { ExecutionQueueClient } from "../clients/execution-queue-client.js";
import { MetricsClient } from "../clients/metrics-client.js";
import { TimerClient, TimerRequestType } from "../clients/timer-client.js";
import { WorkflowClient } from "../clients/workflow-client.js";
import { ActivityLogContext, LogAgent, LogContextType } from "../log-agent.js";
import { ActivityMetrics, MetricsCommon } from "../metrics/constants.js";
import { Unit } from "../metrics/unit.js";
import { timed } from "../metrics/utils.js";
import { ActivityProvider } from "../providers/activity-provider.js";
import { computeDurationSeconds } from "../schedule.js";
import { ActivityStore } from "../stores/activity-store.js";

export interface CreateActivityWorkerProps {
  timerClient: TimerClient;
  metricsClient: MetricsClient;
  eventClient: EventClient;
  activityProvider: ActivityProvider;
  serviceClient?: EventualServiceClient;
  logAgent: LogAgent;
  executionQueueClient: ExecutionQueueClient;
  activityStore: ActivityStore;
}

export interface ActivityWorker {
  (
    request: ActivityWorkerRequest,
    baseTime?: Date,
    /**
     * Allows for a computed end time, for case like the test environment when the end time should be controlled.
     */
    getEndTime?: (startTime: Date) => Date
  ): Promise<void>;
}

/**
 * Creates a generic function for handling activity worker requests
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createActivityWorker({
  activityProvider,
  activityStore,
  executionQueueClient,
  metricsClient,
  logAgent,
  serviceClient,
  timerClient,
}: CreateActivityWorkerProps): ActivityWorker {
  // make the service client available to all activity code
  if (serviceClient) {
    registerServiceClient(serviceClient);
  }

  return metricsClient.metricScope(
    (metrics) =>
      async (
        request: ActivityWorkerRequest,
        baseTime: Date = new Date(),
        getEndTime = () => new Date()
      ) =>
        await serviceTypeScope(ServiceType.ActivityWorker, async () => {
          const activityHandle = logAgent.isLogLevelSatisfied(LogLevel.DEBUG)
            ? `${request.command.name}:${request.command.seq} for execution ${request.executionId} on retry ${request.retry}`
            : request.command.name;
          metrics.resetDimensions(false);
          metrics.setNamespace(MetricsCommon.EventualNamespace);
          metrics.putDimensions({
            ActivityName: request.command.name,
            WorkflowName: request.workflowName,
          });
          // the time from the workflow emitting the activity scheduled command
          // to the request being seen.
          const activityLogContext: ActivityLogContext = {
            type: LogContextType.Activity,
            activityName: request.command.name,
            executionId: request.executionId,
            seq: request.command.seq,
          };
          const start = baseTime;
          const recordAge =
            start.getTime() - new Date(request.scheduledTime).getTime();
          metrics.putMetric(
            ActivityMetrics.ActivityRequestAge,
            recordAge,
            Unit.Milliseconds
          );
          if (
            !(await timed(metrics, ActivityMetrics.ClaimDuration, () =>
              activityStore.claim(
                request.executionId,
                request.command.seq,
                request.retry
              )
            ))
          ) {
            metrics.putMetric(ActivityMetrics.ClaimRejected, 1, Unit.Count);
            console.info(`Activity ${activityHandle} already claimed.`);
            return;
          }
          if (request.command.heartbeat) {
            await timerClient.startTimer({
              activitySeq: request.command.seq,
              type: TimerRequestType.ActivityHeartbeatMonitor,
              executionId: request.executionId,
              heartbeatSeconds: computeDurationSeconds(
                request.command.heartbeat
              ),
              schedule: request.command.heartbeat,
            });
          }
          setActivityContext({
            activityToken: createActivityToken(
              request.executionId,
              request.command.seq
            ),
            executionId: request.executionId,
            scheduledTime: request.scheduledTime,
            workflowName: request.workflowName,
          });
          metrics.putMetric(ActivityMetrics.ClaimRejected, 0, Unit.Count);

          logAgent.logWithContext(
            activityLogContext,
            LogLevel.DEBUG,
            `Processing ${activityHandle}.`
          );

          const activity = activityProvider.getActivityHandler(
            request.command.name
          );
          try {
            if (!activity) {
              metrics.putMetric(ActivityMetrics.NotFoundError, 1, Unit.Count);
              throw new ActivityNotFoundError(
                request.command.name,
                activityProvider.getActivityIds()
              );
            }

            const result = await logAgent.logContextScope(
              activityLogContext,
              async () => {
                return await timed(
                  metrics,
                  ActivityMetrics.OperationDuration,
                  () => activity(...request.command.args)
                );
              }
            );

            if (isAsyncResult(result)) {
              metrics.setProperty(ActivityMetrics.HasResult, 0);
              metrics.setProperty(ActivityMetrics.AsyncResult, 1);

              // TODO: Send heartbeat on sync activity completion.

              /**
               * The activity has declared that it is async, other than logging, there is nothing left to do here.
               * The activity should call {@link WorkflowClient.sendActivitySuccess} or {@link WorkflowClient.sendActivityFailure} when it is done.
               */
              return timed(
                metrics,
                ActivityMetrics.ActivityLogWriteDuration,
                () => logAgent.flush()
              );
            } else if (result) {
              metrics.setProperty(ActivityMetrics.HasResult, 1);
              metrics.setProperty(ActivityMetrics.AsyncResult, 0);
              metrics.putMetric(
                ActivityMetrics.ResultBytes,
                JSON.stringify(result).length,
                Unit.Bytes
              );
            } else {
              metrics.setProperty(ActivityMetrics.HasResult, 0);
              metrics.setProperty(ActivityMetrics.AsyncResult, 0);
            }

            logAgent.logWithContext(
              activityLogContext,
              LogLevel.INFO,
              `Activity ${activityHandle} succeeded, reporting back to execution.`
            );

            const endTime = getEndTime(start);
            const event = createEvent<ActivitySucceeded>(
              {
                type: WorkflowEventType.ActivitySucceeded,
                seq: request.command.seq,
                result,
              },
              endTime
            );

            await finishActivity(
              event,
              recordAge + (endTime.getTime() - start.getTime())
            );
          } catch (err) {
            const [error, message] = extendsError(err)
              ? [err.name, err.message]
              : ["Error", JSON.stringify(err)];

            logAgent.logWithContext(
              activityLogContext,
              LogLevel.DEBUG,
              `Activity ${activityHandle} failed, reporting failure back to execution: ${error}: ${message}`
            );

            const endTime = getEndTime(start);
            const event = createEvent<ActivityFailed>(
              {
                type: WorkflowEventType.ActivityFailed,
                seq: request.command.seq,
                error,
                message,
              },
              endTime
            );

            await finishActivity(
              event,
              recordAge + (endTime.getTime() - start.getTime())
            );
          } finally {
            clearActivityContext();
          }

          function logActivityCompleteMetrics(
            failed: boolean,
            duration: number
          ) {
            metrics.putMetric(
              ActivityMetrics.ActivityFailed,
              failed ? 1 : 0,
              Unit.Count
            );
            metrics.putMetric(
              ActivityMetrics.ActivitySucceeded,
              failed ? 0 : 1,
              Unit.Count
            );
            // The total time from the activity being scheduled until it's result is send to the workflow.
            metrics.putMetric(ActivityMetrics.TotalDuration, duration);
          }

          async function finishActivity(
            event: ActivitySucceeded | ActivityFailed,
            duration: number
          ) {
            const logFlush = timed(
              metrics,
              ActivityMetrics.ActivityLogWriteDuration,
              () => logAgent.flush()
            );
            await timed(
              metrics,
              ActivityMetrics.SubmitWorkflowTaskDuration,
              () =>
                executionQueueClient.submitExecutionEvents(
                  request.executionId,
                  event
                )
            );
            await logFlush;

            logActivityCompleteMetrics(isWorkflowFailed(event), duration);
          }
        })
  );
}
