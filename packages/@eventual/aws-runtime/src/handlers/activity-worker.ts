import {
  ActivityCompleted,
  ActivityFailed,
  getCallableActivity,
  getCallableActivityNames,
  isWorkflowFailed,
  WorkflowEventType,
} from "@eventual/core";
import { Handler } from "aws-lambda";
import { ActivityWorkerRequest } from "../activity.js";
import {
  createActivityRuntimeClient,
  createEvent,
  createExecutionHistoryClient,
  createWorkflowClient,
} from "../clients/index.js";
import { metricScope, Unit } from "aws-embedded-metrics";
import { timed } from "src/metric-utils.js";
import { workflowName } from "src/env.js";

const activityRuntimeClient = createActivityRuntimeClient();
const executionHistoryClient = createExecutionHistoryClient();
const workflowClient = createWorkflowClient();

export const activityWorker = (): Handler<ActivityWorkerRequest, void> => {
  return metricScope((metrics) => async (request) => {
    const activityHandle = `${request.command.seq} for execution ${request.executionId} on retry ${request.retry}`;
    metrics.resetDimensions(false);
    metrics.setNamespace("Eventual");
    metrics.putDimensions({
      ActivityName: request.command.name,
      WorkflowName: workflowName(),
    });
    // the time from the workflow emitting the activity scheduled command
    // to the request being seen.
    const start = new Date();
    const recordAge =
      start.getTime() - new Date(request.scheduledTime).getTime();
    metrics.putMetric("ActivityRequestAge", recordAge, Unit.Milliseconds);
    if (
      !(await timed(metrics, "ClaimDuration", () =>
        activityRuntimeClient.requestExecutionActivityClaim(
          request.executionId,
          request.command,
          request.retry
        )
      ))
    ) {
      metrics.putMetric("ClaimRejected", 1, Unit.Count);
      console.info(`Activity ${activityHandle} already claimed.`);
      return;
    }
    metrics.putMetric("ClaimRejected", 0, Unit.Count);

    console.info(`Processing ${activityHandle}.`);

    const activity = getCallableActivity(request.command.name);
    try {
      if (!activity) {
        metrics.putMetric("NotFoundError", 1, Unit.Count);
        throw new ActivityNotFoundError(request.command.name);
      }

      const result = await timed(metrics, "OperationDuration", () =>
        activity(...request.command.args)
      );
      if (result) {
        metrics.setProperty("HasResult", 1);
        metrics.putMetric(
          "ResultBytes",
          JSON.stringify(result).length,
          Unit.Bytes
        );
      } else {
        metrics.setProperty("HasResult", 0);
      }

      console.info(
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

      console.info(
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
      metrics.putMetric("ActivityFailed", failed ? 1 : 0, Unit.Count);
      metrics.putMetric("ActivityCompleted", failed ? 0 : 1, Unit.Count);
      // The total time from the activity being scheduled until it's result is send to the workflow.
      metrics.putMetric("TotalDuration", duration);
    }

    async function finishActivity(event: ActivityCompleted | ActivityFailed) {
      await timed(metrics, "EmitEventDuration", () =>
        executionHistoryClient.putEvent(request.executionId, event)
      );

      await timed(metrics, "SubmitWorkflowTaskDuration", () =>
        workflowClient.submitWorkflowTask(request.executionId, event)
      );

      logActivityCompleteMetrics(isWorkflowFailed(event), event.duration);
    }
  });
};

class ActivityNotFoundError extends Error {
  constructor(activityName: string) {
    super(
      `Could not find an activity with the name ${activityName}, found: ${getCallableActivityNames()}`
    );
  }
}
