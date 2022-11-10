import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";
import { Handler } from "aws-lambda";
import { tableName, workflowQueueUrl } from "../env.js";
import { ExecutionHistoryClient } from "../execution-history-client.js";
import { WorkflowClient } from "../workflow-client.js";

export interface StartWorkflowRequest {
  name: string;
  input: any;
}

export interface StartWorkflowResponse {
  executionId: string;
}

const dynamo = new DynamoDBClient({});
const sqs = new SQSClient({});

const executionHistoryClient = new ExecutionHistoryClient({
  dynamo,
  tableName: tableName ?? "",
});
const workflowClient = new WorkflowClient({
  sqs,
  workflowQueueUrl: workflowQueueUrl ?? "",
  executionHistory: executionHistoryClient,
  dynamo,
  tableName: tableName ?? "",
});

export const handle: Handler<
  StartWorkflowRequest,
  StartWorkflowResponse
> = async (request) => {
  return {
    executionId: await workflowClient.startWorkflow(
      request.name,
      request.input
    ),
  };
};
