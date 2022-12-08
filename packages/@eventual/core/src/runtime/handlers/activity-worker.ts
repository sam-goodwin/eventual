import {
  getCallableActivity,
  getCallableActivityNames,
} from "../../activity.js";
import { ScheduleActivityCommand } from "../../command.js";
import {
  ActivityCompleted,
  ActivityFailed,
  createEvent,
  isWorkflowFailed,
  WorkflowEventType,
} from "../../workflow-events.js";
import { registerEventClient, registerWorkflowClient } from "../../global.js";
import type { ActivityRuntimeClient } from "../clients/activity-runtime-client.js";
import type { ExecutionHistoryClient } from "../clients/execution-history-client.js";
import type { MetricsClient } from "../clients/metrics-client.js";
import type { WorkflowClient } from "../clients/workflow-client.js";
import type { Logger } from "../logger.js";
import { ActivityMetrics, MetricsCommon } from "../metrics/constants.js";
import { Unit } from "../metrics/unit.js";
import { timed } from "../metrics/utils.js";
import type { EventClient } from "../index.js";

export interface CreateActivityWorkerProps {
  activityRuntimeClient: ActivityRuntimeClient;
  executionHistoryClient: ExecutionHistoryClient;
  workflowClient: WorkflowClient;
  metricsClient: MetricsClient;
  logger: Logger;
  eventClient: EventClient;
}

export interface ActivityWorkerRequest {
  scheduledTime: string;
  workflowName: string;
  executionId: string;
  command: ScheduleActivityCommand;
  retry: number;
}

/**
 * Creates a generic function for handling activity worker requests
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createActivityWorker({
  activityRuntimeClient,
  executionHistoryClient,
  workflowClient,
  metricsClient,
  logger,
  eventClient,
}: CreateActivityWorkerProps): (
  request: ActivityWorkerRequest
) => Promise<void> {
  // make the workflow client available to all activity code
  registerWorkflowClient(workflowClient);
  // make the event client available to all activity code
  registerEventClient(eventClient);

  return metricsClient.metricScope(
    (metrics) => async (request: ActivityWorkerRequest) => {
      logger.addPersistentLogAttributes({
        workflowName: request.workflowName,
        executionId: request.executionId,
      });
      const activityHandle = `${request.command.seq} for execution ${request.executionId} on retry ${request.retry}`;
      metrics.resetDimensions(false);
      metrics.setNamespace(MetricsCommon.EventualNamespace);
      metrics.putDimensions({
        ActivityName: request.command.name,
        WorkflowName: request.workflowName,
      });
      // the time from the workflow emitting the activity scheduled command
      // to the request being seen.
      const start = new Date();
      const recordAge =
        start.getTime() - new Date(request.scheduledTime).getTime();
      metrics.putMetric(
        ActivityMetrics.ActivityRequestAge,
        recordAge,
        Unit.Milliseconds
      );
      if (
        !(await timed(metrics, ActivityMetrics.ClaimDuration, () =>
          activityRuntimeClient.requestExecutionActivityClaim(
            request.executionId,
            request.command,
            request.retry
          )
        ))
      ) {
        metrics.putMetric(ActivityMetrics.ClaimRejected, 1, Unit.Count);
        logger.info(`Activity ${activityHandle} already claimed.`);
        return;
      }
      metrics.putMetric(ActivityMetrics.ClaimRejected, 0, Unit.Count);

      logger.info(`Processing ${activityHandle}.`);

      const activity = getCallableActivity(request.command.name);
      try {
        if (!activity) {
          metrics.putMetric(ActivityMetrics.NotFoundError, 1, Unit.Count);
          throw new ActivityNotFoundError(request.command.name);
        }

        const result = await timed(
          metrics,
          ActivityMetrics.OperationDuration,
          () => activity(...request.command.args)
        );
        if (result) {
          metrics.setProperty(ActivityMetrics.HasResult, 1);
          metrics.putMetric(
            ActivityMetrics.ResultBytes,
            JSON.stringify(result).length,
            Unit.Bytes
          );
        } else {
          metrics.setProperty(ActivityMetrics.HasResult, 0);
        }

        logger.info(
          `Activity ${activityHandle} succeeded, reporting back to execution.`
        );

        // TODO: do not write event here, write it in the orchestrator.
        const endTime = new Date();
        const duration = recordAge + (endTime.getTime() - start.getTime());
        const event = createEvent<ActivityCompleted>({
          type: WorkflowEventType.ActivityCompleted,
          seq: request.command.seq,
          duration,
          result,
        });

        await finishActivity(event);
      } catch (err) {
        const [error, message] =
          err instanceof Error
            ? [err.name, err.message]
            : ["Error", JSON.stringify(err)];

        logger.info(
          `Activity ${activityHandle} failed, reporting failure back to execution: ${error}: ${message}`
        );

        // TODO: do not write event here, write it in the orchestrator.
        const endTime = new Date();
        const duration = recordAge + (endTime.getTime() - start.getTime());
        const event = createEvent<ActivityFailed>(
          {
            type: WorkflowEventType.ActivityFailed,
            seq: request.command.seq,
            duration,
            error,
            message,
          },
          endTime
        );

        await finishActivity(event);

        throw err;
      }

      function logActivityCompleteMetrics(failed: boolean, duration: number) {
        metrics.putMetric(
          ActivityMetrics.ActivityFailed,
          failed ? 1 : 0,
          Unit.Count
        );
        metrics.putMetric(
          ActivityMetrics.ActivityCompleted,
          failed ? 0 : 1,
          Unit.Count
        );
        // The total time from the activity being scheduled until it's result is send to the workflow.
        metrics.putMetric(ActivityMetrics.TotalDuration, duration);
      }

      async function finishActivity(event: ActivityCompleted | ActivityFailed) {
        await timed(metrics, ActivityMetrics.EmitEventDuration, () =>
          executionHistoryClient.putEvent(request.executionId, event)
        );

        await timed(metrics, ActivityMetrics.SubmitWorkflowTaskDuration, () =>
          workflowClient.submitWorkflowTask(request.executionId, event)
        );

        logActivityCompleteMetrics(isWorkflowFailed(event), event.duration);
      }
    }
  );
}

class ActivityNotFoundError extends Error {
  constructor(activityName: string) {
    super(
      `Could not find an activity with the name ${activityName}, found: ${getCallableActivityNames()}`
    );
  }
}
