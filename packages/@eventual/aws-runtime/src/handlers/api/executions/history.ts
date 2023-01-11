import { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createExecutionHistoryClient } from "../../../clients/create.js";
import { withErrorMiddleware } from "../middleware.js";
import { decodeExecutionId, WorkflowEvent } from "@eventual/core";

const workflowClient = createExecutionHistoryClient();

async function history(event: APIGatewayProxyEventV2) {
  const executionId = event.pathParameters?.executionId;
  if (!executionId) {
    return { statusCode: 400, body: `Missing executionId` };
  }

  // TODO pagination
  return (
    await workflowClient.getEvents({
      executionId: decodeExecutionId(executionId),
    })
  ).events;
}

export const handler: APIGatewayProxyHandlerV2<WorkflowEvent[]> =
  withErrorMiddleware(history);
