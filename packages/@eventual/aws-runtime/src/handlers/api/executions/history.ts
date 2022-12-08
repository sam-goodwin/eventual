import { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createExecutionHistoryClient } from "../../../clients/index.js";
import { getService } from "../service-properties.js";
import { withErrorMiddleware } from "../middleware.js";
import { decodeExecutionId, WorkflowEvent } from "@eventual/core";

async function history(event: APIGatewayProxyEventV2) {
  const executionId = event.pathParameters?.executionId;
  if (!executionId) {
    return { statusCode: 400, body: `Missing executionId` };
  }

  const workflowClient = createExecutionHistoryClient(getService());
  return workflowClient.getEvents(decodeExecutionId(executionId));
}

export const handler: APIGatewayProxyHandlerV2<WorkflowEvent[]> =
  withErrorMiddleware(history);
