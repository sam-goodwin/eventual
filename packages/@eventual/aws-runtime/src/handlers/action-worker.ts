import {
  ActivityCompleted,
  ActivityFailed,
  getCallableAction,
  getCallableActionNames,
  WorkflowEventType,
} from "@eventual/core";
import { Handler } from "aws-lambda";
import { ActionWorkerRequest } from "../action.js";
import {
  createActivityRuntimeClient,
  createExecutionHistoryClient,
  createWorkflowClient,
} from "../clients/index.js";

const activityRuntimeClient = createActivityRuntimeClient();
const executionHistoryClient = createExecutionHistoryClient();
const workflowClient = createWorkflowClient();

export const actionWorker = (): Handler<ActionWorkerRequest, void> => {
  return async (request) => {
    const activityHandle = `${request.action.threadID} ${request.action.id} for execution ${request.executionId} on retry ${request.retry}`;
    if (
      !(await activityRuntimeClient.requestExecutionActivityClaim(
        request.executionId,
        request.action,
        request.retry
      ))
    ) {
      console.info(`Activity ${activityHandle} already claimed.`);
      return;
    }

    console.info(`Processing ${activityHandle}.`);

    const action = getCallableAction(request.action.name);
    try {
      if (!action) {
        throw new ActionNotFoundError(request.action.name);
      }

      // TODO: lock

      const result = await action(request.action.args);

      console.info(
        `Activity ${activityHandle} succeeded, reporting back to execution.`
      );

      const event =
        await executionHistoryClient.createAndPutEvent<ActivityCompleted>(
          request.executionId,
          {
            type: WorkflowEventType.ActivityCompleted,
            name: request.action.name,
            seq: request.action.id,
            threadId: request.action.threadID,
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
            name: request.action.name,
            seq: request.action.id,
            threadId: request.action.threadID,
            error,
            message,
          }
        );

      await workflowClient.submitWorkflowTask(request.executionId, event);
      throw err;
    }
  };
};

class ActionNotFoundError extends Error {
  constructor(actionName: string) {
    super(
      `Could not find an action with the name ${actionName}, found: ${getCallableActionNames()}`
    );
  }
}
