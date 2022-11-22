import middy from "@middy/core";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { createExecutionHistoryClient } from "../../../clients";
import { workflows } from "../env";
import { errorMiddleware } from "../middleware";

async function history(event: APIGatewayProxyEventV2) {
  const workflowName = event.pathParameters?.name;
  if (!workflowName) {
    return { statusCode: 400, body: `Missing workflowName` };
  }
  const executionId = event.pathParameters?.executionId;
  if (!executionId) {
    return { statusCode: 400, body: `Missing executionId` };
  }
  const workflow = workflows[workflowName];
  if (!workflow) {
    return {
      statusCode: 400,
      body: `Workflow ${workflowName} does not exist!`,
    };
  }

  const workflowClient = createExecutionHistoryClient(workflow);
  return workflowClient.getEvents(executionId);
}

export const handler = middy(history).use(errorMiddleware);
