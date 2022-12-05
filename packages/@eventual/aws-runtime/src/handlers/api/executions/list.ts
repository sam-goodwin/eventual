import { createWorkflowRuntimeClient } from "../../../clients/index.js";
import { getService } from "../service-properties.js";
import { withErrorMiddleware } from "../middleware.js";
import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Execution } from "@eventual/core";

async function list() {
  const workflowClient = createWorkflowRuntimeClient(getService());
  return workflowClient.getExecutions();
}

export const handler: APIGatewayProxyHandlerV2<Execution[]> =
  withErrorMiddleware(list);
