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
import { tableName, workflowQueueUrl } from "../env";
import { ExecutionHistoryClient } from "../clients/execution-history-client";
import { WorkflowClient } from "../clients/workflow-client";

const dynamo = new DynamoDBClient({});

const executionHistoryClient = new ExecutionHistoryClient({
  dynamo,
  tableName: tableName ?? "",
});

const workflowClient = new WorkflowClient({
  dynamo,
  executionHistory: executionHistoryClient,
  tableName: tableName ?? "",
  workflowQueueUrl: workflowQueueUrl ?? "",
  sqs: new SQSClient({}),
});

export const actionWorker = (): Handler<ActionWorkerRequest, void> => {
  return async (request) => {
    const action = getCallableAction(request.action.name);
    try {
      if (!action) {
        throw new ActionNotFoundError(request.action.name);
      }

      const result = await action(request.action.args);

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
    } catch (err) {
      const [error, message] =
        err instanceof Error
          ? [err.name, err.message]
          : ["Error", JSON.stringify(err)];

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
      throw new Error("ActionNotFound: " + message);
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
