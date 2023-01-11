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
 *
 * Path Parameters;
 * * workflowName - name of the workflow to start
 *
 * Query Parameters:
 * * timeoutSeconds - Number of seconds the workflow should run before it times out. Default: use the configured timeout or no timeout.
 * * executionName - name to give the workflow. Default: auto generated UUID.
 */
export const handler: APIGatewayProxyHandlerV2<StartExecutionResponse> =
  withErrorMiddleware(async (event: APIGatewayProxyEventV2) => {
    const { timeoutSeconds: timeoutSecondsString, executionName } =
      event.queryStringParameters ?? {};

    const timeoutSeconds = timeoutSecondsString
      ? parseInt(timeoutSecondsString)
      : undefined;

    if (timeoutSeconds !== undefined && isNaN(timeoutSeconds)) {
      throw new Error(
        "Expected optional parameter timeoutSeconds to be a valid number"
      );
    }

    const workflowName = event.pathParameters?.name;
    if (!workflowName) {
      return { statusCode: 400, body: `Missing workflow name` };
    }

    return await workflowClient.startExecution({
      workflow: workflowName,
      input: event.body && JSON.parse(event.body),
      executionName,
      timeoutSeconds,
    });
  });
