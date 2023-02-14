import { HistoryStateEvent } from "@eventual/core";
import { decodeExecutionId } from "@eventual/core/internal";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
} from "aws-lambda";
import { createExecutionHistoryStateStore } from "../../../create.js";
import { withErrorMiddleware } from "../middleware.js";

const executionHistoryStateStore = createExecutionHistoryStateStore();

async function workflowHistory(event: APIGatewayProxyEventV2) {
  const executionId = event.pathParameters?.executionId;
  if (!executionId) {
    return { statusCode: 400, body: `Missing executionId` };
  }

  return executionHistoryStateStore.getHistory(decodeExecutionId(executionId));
}

export const handler: APIGatewayProxyHandlerV2<HistoryStateEvent[]> =
  withErrorMiddleware(workflowHistory);
