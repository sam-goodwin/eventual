import { APIGatewayProxyEventV2 } from "aws-lambda";
import { createExecutionHistoryClient } from "../../../clients/index.js";
import { getService } from "../service-properties.js";
import { withErrorMiddleware } from "../middleware.js";
import { decodeExecutionId } from "src/execution-id.js";

async function history(event: APIGatewayProxyEventV2) {
  const executionId = event.pathParameters?.executionId;
  if (!executionId) {
    return { statusCode: 400, body: `Missing executionId` };
  }

  const workflowClient = createExecutionHistoryClient(getService());
  return workflowClient.getEvents(decodeExecutionId(executionId));
}

export const handler = withErrorMiddleware(history);
