import { decodeExecutionId, SendSignalRequest } from "@eventual/core";
import { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createExecutionQueueClient } from "../../../../create.js";
import { withErrorMiddleware } from "../../middleware.js";

const executionQueueClient = createExecutionQueueClient();

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

  return await executionQueueClient.sendSignal({
    ...request,
    execution: decodeExecutionId(executionId),
  });
}

export const handler: APIGatewayProxyHandlerV2<void> =
  withErrorMiddleware(sendSignal);
