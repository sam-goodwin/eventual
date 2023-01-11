import { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createExecutionHistoryClient } from "../../../clients/index.js";
import { withErrorMiddleware } from "../middleware.js";
import {
  decodeExecutionId,
  ExecutionEventsResponse,
  SortOrder,
} from "@eventual/core";

const workflowClient = createExecutionHistoryClient();

/**
 * Get events for a workflow.
 *
 * Path Parameters:
 * * executionId - Execution to get events for
 *
 * Query Parameters:
 * * sortDirection - Asc | Desc - Direction to sort the result by start time. Default: Asc
 * * maxResult - maximum number of results to return. Default: 100
 * * nextToken - continue a previous request
 * * after - a ISO 8601 timestamp which all events should be after
 */
export const handler: APIGatewayProxyHandlerV2<ExecutionEventsResponse> =
  withErrorMiddleware(async (event: APIGatewayProxyEventV2) => {
    const {
      nextToken,
      maxResults: maxResultString,
      sortDirection: rawSortDirection,
      after,
    } = event.queryStringParameters ?? {};

    const maxResults = maxResultString ? parseInt(maxResultString) : undefined;
    if (maxResults && isNaN(maxResults)) {
      return {
        statusCode: 400,
        body: "Expected optional parameter maxResults to be a number",
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

    const executionId = event.pathParameters?.executionId;
    if (!executionId) {
      return { statusCode: 400, body: `Missing executionId` };
    }

    return workflowClient.getEvents({
      executionId: decodeExecutionId(executionId),
      maxResults,
      nextToken,
      after,
      sortDirection: sortDirection as SortOrder | undefined,
    });
  });
