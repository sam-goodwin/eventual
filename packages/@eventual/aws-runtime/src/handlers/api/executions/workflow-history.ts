import { HistoryStateEvents } from "@eventual/core";
import middy from "@middy/core";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { createWorkflowRuntimeClient } from "../../../clients";
import { workflows } from "../env";
import { errorMiddleware } from "../middleware";

async function workflowHistory(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2<HistoryStateEvents[]>> {
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

  const workflowClient = createWorkflowRuntimeClient(workflow);
  return workflowClient.getHistory(executionId);
}

export const handler = middy(workflowHistory).use(errorMiddleware);
