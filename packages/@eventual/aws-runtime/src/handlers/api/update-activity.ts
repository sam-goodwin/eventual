import { createActivityClient } from "../../create.js";
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

const activityClient = createActivityClient();

export const handler: APIGatewayProxyHandlerV2<SendActivityUpdateResponse> =
  withErrorMiddleware(async (event: APIGatewayProxyEventV2) => {
    const body = event.body;
    if (!body) {
      return { statusCode: 400, body: "Send Activity Update must have a body" };
    }
    const activityRequest = JSON.parse(body) as SendActivityUpdate;
    if (isSendActivitySuccessRequest(activityRequest)) {
      return activityClient.sendSuccess(activityRequest);
    } else if (isSendActivityFailureRequest(activityRequest)) {
      return activityClient.sendFailure(activityRequest);
    } else if (isSendActivityHeartbeatRequest(activityRequest)) {
      return activityClient.sendHeartbeat(activityRequest);
    }

    try {
      return assertNever(activityRequest);
    } catch {
      return { statusCode: 400, body: "Invalid activity update request" };
    }
  });
