import middy from "@middy/core";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { createExecutionHistoryClient } from "../../../clients";
import { getService } from "../service-properties";
import { errorMiddleware } from "../middleware";

async function history(event: APIGatewayProxyEventV2) {
  const executionId = event.pathParameters?.executionId;
  if (!executionId) {
    return { statusCode: 400, body: `Missing executionId` };
  }

  const workflowClient = createExecutionHistoryClient(getService());
  return workflowClient.getEvents(atob(executionId));
}

export const handler = middy(history).use(errorMiddleware);
