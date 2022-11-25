import middy from "@middy/core";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { createWorkflowRuntimeClient } from "../../../clients";
import { getService } from "../service-properties";
import { errorMiddleware } from "../middleware";

async function list(_event: APIGatewayProxyEventV2) {
  const workflowClient = createWorkflowRuntimeClient(getService());
  return workflowClient.getExecutions();
}

export const handler = middy(list).use(errorMiddleware);
