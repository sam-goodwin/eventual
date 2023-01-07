import { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { withErrorMiddleware } from "../../middleware.js";
import { decodeExecutionId, SendSignalRequest } from "@eventual/core";
import { createWorkflowClient } from "../../../../clients/create.js";

const workflowClient = createWorkflowClient({
  activityTableName: "NOT_NEEDED",
  serviceLogGroup: "NOT_NEEDED",
});

async function sendSignal(event: APIGatewayProxyEventV2) {
  const executionId = event.pathParameters?.executionId;
  if (!executionId) {
    return { statusCode: 400, body: `Missing executionId` };
  }
  if (!event.body) {
    return { statusCode: 400, body: `Send signal must have a json payload` };
  }
  const request = JSON.parse(event.body) as Omit<
    SendSignalRequest,
    "execution"
  >;

  return await workflowClient.sendSignal({
    ...request,
    execution: decodeExecutionId(executionId),
  });
}

export const handler: APIGatewayProxyHandlerV2<void> =
  withErrorMiddleware(sendSignal);
