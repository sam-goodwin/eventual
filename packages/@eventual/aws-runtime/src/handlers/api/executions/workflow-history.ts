import { decodeExecutionId, HistoryStateEvent } from "@eventual/core";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
} from "aws-lambda";
import {
  createWorkflowClient,
  createWorkflowRuntimeClient,
} from "../../../clients/index.js";
import { withErrorMiddleware } from "../middleware.js";

const workflowClient = createWorkflowRuntimeClient({
  // TODO: further decouple the clients
  activityWorkerFunctionName: "NOT_NEEDED",
  tableName: "NOT_NEEDED",
  workflowClient: createWorkflowClient({ serviceLogGroup: "NOT_NEEDED" }),
});

async function workflowHistory(event: APIGatewayProxyEventV2) {
  const executionId = event.pathParameters?.executionId;
  if (!executionId) {
    return { statusCode: 400, body: `Missing executionId` };
  }

  return workflowClient.getHistory(decodeExecutionId(executionId));
}

export const handler: APIGatewayProxyHandlerV2<HistoryStateEvent[]> =
  withErrorMiddleware(workflowHistory);
