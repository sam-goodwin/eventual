import {
  ActivityCompleted,
  ActivityFailed,
  getCallableActivity,
  getCallableActivityNames,
  WorkflowEventType,
} from "@eventual/core";
import { Handler } from "aws-lambda";
import { ActivityWorkerRequest } from "../activity.js";
import {
  createActivityRuntimeClient,
  createExecutionHistoryClient,
  createWorkflowClient,
} from "../clients/index.js";
import { metricScope, Unit } from "aws-embedded-metrics";
import { timed } from "src/metric-utils.js";

const activityRuntimeClient = createActivityRuntimeClient();
const executionHistoryClient = createExecutionHistoryClient();
const workflowClient = createWorkflowClient();

export const activityWorker = (): Handler<ActivityWorkerRequest, void> => {
  return metricScope((metrics) => async (request) => {
    const activityHandle = `${request.command.seq} for execution ${request.executionId} on retry ${request.retry}`;
    metrics.setNamespace("Eventual.Activities");
    metrics.putDimensions({ "Activity.Name": request.command.name });
    metrics.putMetric(
      "Activity.RequestAge",
      new Date().getTime() - new Date(request.sentTimestamp).getTime(),
      Unit.Milliseconds
    );
    if (
      !(await timed(metrics, "Activity.ClaimTime", () =>
        activityRuntimeClient.requestExecutionActivityClaim(
          request.executionId,
          request.command,
          request.retry
        )
      ))
    ) {
      metrics.putMetric("Activity.ClaimRejected", 1, Unit.Count);
      console.info(`Activity ${activityHandle} already claimed.`);
      return;
    }
    metrics.putMetric("Activity.ClaimRejected", 0, Unit.Count);

    console.info(`Processing ${activityHandle}.`);

    const activity = getCallableActivity(request.command.name);
    try {
      if (!activity) {
        metrics.putMetric("Activity.NotFoundError", 1, Unit.Count);
        throw new ActivityNotFoundError(request.command.name);
      }

      const result = await timed(metrics, "Activity.OperationTime", () =>
        activity(...request.command.args)
      );
      if (result) {
        metrics.putMetric("Activity.HasResult", 1, Unit.Count);
        metrics.putMetric(
          "Activity.ResultBytes",
          JSON.stringify(result).length,
          Unit.Bytes
        );
      } else {
        metrics.putMetric("Activity.HasResult", 0, Unit.Count);
      }

      console.info(
        `Activity ${activityHandle} succeeded, reporting back to execution.`
      );

      // TODO: do not write event here, write it in the orchestrator.
      const event = await timed(
        metrics,
        "Activity.CreateCompletedEventTime",
        () =>
          executionHistoryClient.createAndPutEvent<ActivityCompleted>(
            request.executionId,
            {
              type: WorkflowEventType.ActivityCompleted,
              seq: request.command.seq,
              result,
            }
          )
      );

      await timed(metrics, "Activity.SubmitWorkflowTaskTime", () =>
        workflowClient.submitWorkflowTask(request.executionId, event)
      );

      metrics.putMetric("Activity.Failed", 0, Unit.Count);
      metrics.putMetric("Activity.Completed", 1, Unit.Count);

      console.info(`Workflow task and events sent`);
    } catch (err) {
      metrics.putMetric("Activity.Failed", 1, Unit.Count);
      metrics.putMetric("Activity.Completed", 0, Unit.Count);

      const [error, message] =
        err instanceof Error
          ? [err.name, err.message]
          : ["Error", JSON.stringify(err)];

      console.info(
        `Activity ${activityHandle} failed, reporting failure back to execution: ${error}: ${message}`
      );

      // TODO: do not write event here, write it in the orchestrator.
      const event = await timed(
        metrics,
        "Activity.CreateCompletedEventTime",
        () =>
          executionHistoryClient.createAndPutEvent<ActivityFailed>(
            request.executionId,
            {
              type: WorkflowEventType.ActivityFailed,
              seq: request.command.seq,
              error,
              message,
            }
          )
      );

      await timed(metrics, "Activity.SubmitWorkflowTaskTime", () =>
        workflowClient.submitWorkflowTask(request.executionId, event)
      );
      throw err;
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
