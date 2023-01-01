import { createWorkflowClient } from "../../clients/index.js";
import { withErrorMiddleware } from "./middleware.js";
import { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  assertNever,
  isSendActivityFailureRequest,
  isSendActivityHeartbeatRequest,
  isSendActivitySuccessRequest,
  SendActivityUpdate,
  SendActivityUpdateResponse,
} from "@eventual/core";

const workflowClient = createWorkflowClient({ tableName: "NOT_NEEDED" });

export const handler: APIGatewayProxyHandlerV2<SendActivityUpdateResponse> =
  withErrorMiddleware(async (event: APIGatewayProxyEventV2) => {
    const body = event.body;
    if (!body) {
      return { statusCode: 400, body: "Send Activity Update must have a body" };
    }
    const activityRequest = JSON.parse(body) as SendActivityUpdate;
    if (isSendActivitySuccessRequest(activityRequest)) {
      return workflowClient.completeActivity(activityRequest);
    } else if (isSendActivityFailureRequest(activityRequest)) {
      return workflowClient.failActivity(activityRequest);
    } else if (isSendActivityHeartbeatRequest(activityRequest)) {
      return workflowClient.heartbeatActivity(activityRequest);
    }

    try {
      return assertNever(activityRequest);
    } catch {
      return { statusCode: 400, body: "Invalid activity update request" };
    }
  });
