import middy from "@middy/core";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { createWorkflowRuntimeClient } from "../../../clients";
import { workflows } from "../env";
import { errorMiddleware } from "../middleware";

async function list(event: APIGatewayProxyEventV2) {
  const workflowName = event.pathParameters?.name;
  if (!workflowName) {
    return { statusCode: 400, body: `Missing workflowName` };
  }
  const workflow = workflows[workflowName];
  if (!workflow) {
    return {
      statusCode: 400,
      body: `Workflow ${workflowName} does not exist!`,
    };
  }
  const workflowClient = createWorkflowRuntimeClient(workflow);
  return workflowClient.getExecutions();
}

export const handler = middy(list).use(errorMiddleware);
