import { createWorkflowClient } from "../../../clients/index.js";
import { withErrorMiddleware } from "../middleware.js";
import { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  ExecutionStatus,
  GetExecutionsResponse,
  SortOrder,
} from "@eventual/core";

const workflowClient = createWorkflowClient({
  // TODO: further decouple the clients
  activityTableName: "NOT_NEEDED",
  workflowQueueUrl: "NOT_NEEDED",
});

/**
 * Query Parameters:
 * * sortDirection - Asc | Desc - Direction to sort the result by start time. Default: Asc
 * * workflow - workflow name filter
 * * maxResult - maximum number of results to return. Default: 100
 * * nextToken - continue a previous request
 * * statuses - IN_PROGRESS | SUCCEEDED | FAILED - One or more comma delimited statuses to return. Default: all statuses
 */
export const handler: APIGatewayProxyHandlerV2<GetExecutionsResponse> =
  withErrorMiddleware(async function (event: APIGatewayProxyEventV2) {
    const {
      workflow,
      nextToken,
      maxResults: maxResultString,
      sortDirection: rawSortDirection,
      statuses: rawStatuses,
    } = event.queryStringParameters ?? {};

    const maxResults = maxResultString ? parseInt(maxResultString) : undefined;
    if (maxResults && isNaN(maxResults)) {
      return {
        statusCode: 400,
        body: "Expected optional parameter maxResults to be a number",
      };
    }
    const statusStrings = rawStatuses
      ? rawStatuses.split(",").map((s) => s.toUpperCase())
      : undefined;

    if (
      statusStrings &&
      !statusStrings.every((s): s is ExecutionStatus =>
        Object.values(ExecutionStatus).includes(s as ExecutionStatus)
      )
    ) {
      return {
        statusCode: 400,
        body: `Expected optional parameter statuses to be one or more of ${Object.values(
          ExecutionStatus
        ).join(",")}`,
      };
    }

    const sortDirection = rawSortDirection?.toUpperCase();
    if (
      sortDirection &&
      !Object.values(SortOrder).includes(sortDirection as SortOrder)
    ) {
      return {
        statusCode: 400,
        body: `Expected optional parameter sortDirection to be one of ${Object.values(
          SortOrder
        ).join(",")}`,
      };
    }

    return workflowClient.getExecutions({
      workflowName: workflow,
      statuses: statusStrings,
      maxResults,
      nextToken,
      sortDirection: sortDirection as SortOrder,
    });
  });
