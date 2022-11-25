import { HistoryStateEvent } from "@eventual/core";
import middy from "@middy/core";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { createWorkflowRuntimeClient } from "../../../clients";
import { getService } from "../service-properties";
import { errorMiddleware } from "../middleware";
import { decodeExecutionId } from "src/execution-id";

async function workflowHistory(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2<HistoryStateEvent[]>> {
  const executionId = event.pathParameters?.executionId;
  if (!executionId) {
    return { statusCode: 400, body: `Missing executionId` };
  }

  const workflowClient = createWorkflowRuntimeClient(getService());
  return workflowClient.getHistory(decodeExecutionId(executionId));
}

export const handler = middy(workflowHistory).use(errorMiddleware);
