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

const activityRuntimeClient = createActivityRuntimeClient();
const executionHistoryClient = createExecutionHistoryClient();
const workflowClient = createWorkflowClient();

export const activityWorker = (): Handler<ActivityWorkerRequest, void> => {
  return async (request) => {
    const activityHandle = `${request.command.seq} for execution ${request.executionId} on retry ${request.retry}`;
    if (
      !(await activityRuntimeClient.requestExecutionActivityClaim(
        request.executionId,
        request.command,
        request.retry
      ))
    ) {
      console.info(`Activity ${activityHandle} already claimed.`);
      return;
    }

    console.info(`Processing ${activityHandle}.`);

    const activity = getCallableActivity(request.command.name);
    try {
      if (!activity) {
        throw new ActivityNotFoundError(request.command.name);
      }

      // TODO: lock

      const result = await activity(...request.command.args);

      console.info(
        `Activity ${activityHandle} succeeded, reporting back to execution.`
      );

      const event =
        await executionHistoryClient.createAndPutEvent<ActivityCompleted>(
          request.executionId,
          {
            type: WorkflowEventType.ActivityCompleted,
            seq: request.command.seq,
            result,
          }
        );

      await workflowClient.submitWorkflowTask(request.executionId, event);

      console.info(`Workflow task and events sent`);
    } catch (err) {
      const [error, message] =
        err instanceof Error
          ? [err.name, err.message]
          : ["Error", JSON.stringify(err)];

      console.info(
        `Activity ${activityHandle} failed, reporting failure back to execution: ${error}: ${message}`
      );

      const event =
        await executionHistoryClient.createAndPutEvent<ActivityFailed>(
          request.executionId,
          {
            type: WorkflowEventType.ActivityFailed,
            seq: request.command.seq,
            error,
            message,
          }
        );

      await workflowClient.submitWorkflowTask(request.executionId, event);
      throw err;
    }
  };
};

class ActivityNotFoundError extends Error {
  constructor(activityName: string) {
    super(
      `Could not find an activity with the name ${activityName}, found: ${getCallableActivityNames()}`
    );
  }
}
