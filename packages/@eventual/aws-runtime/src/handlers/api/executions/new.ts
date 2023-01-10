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
 * Query Parameters:
 * * sortDirection - Asc | Desc - Direction to sort the result by start time. Default: Asc
 * * workflow - workflow name filter
 * * maxResult - maximum number of results to return. Default: 100
 * * nextToken - continue a previous request
 * * statuses - IN_PROGRESS | SUCCEEDED | FAILED - One or more comma delimited statuses to return. Default: all statuses
 */
export const handler: APIGatewayProxyHandlerV2<StartExecutionResponse> =
  withErrorMiddleware(async (event: APIGatewayProxyEventV2) => {
    const { timeoutSeconds: timeoutSecondsString, executionName } =
      event.queryStringParameters ?? {};

    const timeoutSeconds = timeoutSecondsString
      ? parseInt(timeoutSecondsString)
      : undefined;

    if (timeoutSeconds && isNaN(timeoutSeconds)) {
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
