// startWorkflow uses the global workflows() to validate the workflow name.
import "@eventual/entry/injected";

import type { StartExecutionResponse } from "@eventual/core";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
} from "aws-lambda";
import { createWorkflowClient } from "../../../clients/create.js";
import { withErrorMiddleware } from "../middleware.js";

const workflowClient = createWorkflowClient({
  activityTableName: "NOT_NEEDED",
});

/**
 * Create a new execution (start a workflow)
 */
export const handler: APIGatewayProxyHandlerV2<StartExecutionResponse> =
  withErrorMiddleware(async (event: APIGatewayProxyEventV2) => {
    const workflowName = event.pathParameters?.name;
    if (!workflowName) {
      return { statusCode: 400, body: `Missing workflow name` };
    }

    return await workflowClient.startExecution({
      workflow: workflowName,
      input: event.body && JSON.parse(event.body),
    });
  });
