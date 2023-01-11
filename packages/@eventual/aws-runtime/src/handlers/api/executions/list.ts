import { withErrorMiddleware } from "../middleware.js";
import {
  createLogsClient,
  createWorkflowClient,
} from "../../../clients/create.js";
import { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { Execution } from "@eventual/core";

const workflowClient = createWorkflowClient({
  // TODO: further decouple the clients
  activityTableName: "NOT_NEEDED",
  workflowQueueUrl: "NOT_NEEDED",
  logsClient: createLogsClient({ serviceLogGroup: "NOT_NEEDED" }),
});

async function list(event: APIGatewayProxyEventV2) {
  const workflow = event.queryStringParameters?.workflow;
  // TODO: support pagination
  return (
    await workflowClient.getExecutions({
      workflowName: workflow,
    })
  ).executions;
}

export const handler: APIGatewayProxyHandlerV2<Execution[]> =
  withErrorMiddleware(list);
