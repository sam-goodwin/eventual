import serviceSpec from "@eventual/injected/spec";

import {
  DurationUnit,
  DURATION_UNITS,
  isDurationUnit,
  Schedule,
  StartExecutionResponse,
} from "@eventual/core";
import { ServiceSpecWorkflowProvider } from "@eventual/runtime-core";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
} from "aws-lambda";
import { createWorkflowClient } from "../../../create.js";
import { withErrorMiddleware } from "../middleware.js";

const workflowProvider = new ServiceSpecWorkflowProvider(serviceSpec);
const workflowClient = createWorkflowClient({
  workflowProvider,
});

/**
 * Create a new execution (start a workflow)
 *
 * Path Parameters;
 * * workflowName - name of the workflow to start
 *
 * Query Parameters:
 * * timeout - Number of `timeoutUnit` (default seconds) the workflow should run before it times out. Default: use the configured timeout or no timeout.
 * * timeoutUnit - "seconds" | "minutes" | "hours" | "days" | "years". Units to use for the timeout, default: "seconds".
 * * executionName - name to give the workflow. Default: auto generated UUID.
 */
export const handler: APIGatewayProxyHandlerV2<StartExecutionResponse> =
  withErrorMiddleware(async (event: APIGatewayProxyEventV2) => {
    const {
      timeout: timeoutString,
      timeoutUnit,
      executionName,
    } = event.queryStringParameters ?? {};

    const timeout = timeoutString ? parseInt(timeoutString) : undefined;

    if (timeout !== undefined && isNaN(timeout)) {
      throw new Error(
        "Expected optional parameter timeout to be a valid number"
      );
    }

    if (timeoutUnit && !isDurationUnit(timeoutUnit)) {
      throw new Error(
        "Expected optional parameter timeoutUnit to be one of: " +
          DURATION_UNITS.join()
      );
    }

    const workflowName = event.pathParameters?.name;
    if (!workflowName) {
      return { statusCode: 400, body: `Missing workflow name` };
    }

    const result = await workflowClient.startExecution({
      workflow: workflowName,
      input: event.body && JSON.parse(event.body),
      executionName,
      timeout: timeout
        ? Schedule.duration(timeout, timeoutUnit as DurationUnit)
        : undefined,
    });

    if (result.alreadyRunning) {
      return result;
    }

    return { statusCode: 200, body: JSON.stringify(result) };
  });
