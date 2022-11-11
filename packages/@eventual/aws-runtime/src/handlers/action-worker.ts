import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";
import {
  ActivityCompletedEvent,
  ActivityFailedEvent,
  getCallableAction,
  getCallableActionNames,
} from "@eventual/core";
import { Handler } from "aws-lambda";
import { ActionWorkerRequest } from "../action";
import { activityLockTableName, tableName, workflowQueueUrl } from "../env";
import { ExecutionHistoryClient } from "../clients/execution-history-client";
import { WorkflowClient } from "../clients/workflow-client";
import { ActivityRuntimeClient } from "../clients/activity-runtime-client";

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });

const executionHistoryClient = new ExecutionHistoryClient({
  dynamo,
  tableName: tableName ?? "",
});
const workflowClient = new WorkflowClient({
  dynamo,
  executionHistory: executionHistoryClient,
  tableName: tableName ?? "",
  workflowQueueUrl: workflowQueueUrl ?? "",
  sqs: new SQSClient({ region: process.env.AWS_REGION }),
});
const activityRuntimeClient = new ActivityRuntimeClient({
  activityLockTableName: activityLockTableName ?? "",
  dynamo: dynamo,
});

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
        await executionHistoryClient.createAndPutEvent<ActivityCompletedEvent>(
          request.executionId,
          {
            type: "ActivityCompletedEvent",
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
        await executionHistoryClient.createAndPutEvent<ActivityFailedEvent>(
          request.executionId,
          {
            type: "ActivityFailedEvent",
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
