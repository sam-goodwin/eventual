import {
  assertNever,
  EventualService,
  isSendActivityFailureRequest,
  isSendActivityHeartbeatRequest,
  isSendActivitySuccessRequest,
  sendActivityUpdateSchema,
} from "@eventual/core/internal";
import { createActivityClient } from "../../create.js";
import { systemCommand } from "./system-command.js";

const activityClient = createActivityClient();

export const handler = systemCommand<EventualService["updateActivity"]>(
  { inputSchema: sendActivityUpdateSchema },
  async (request) => {
    if (isSendActivitySuccessRequest(request)) {
      return activityClient.sendSuccess(request);
    } else if (isSendActivityFailureRequest(request)) {
      return activityClient.sendFailure(request);
    } else if (isSendActivityHeartbeatRequest(request)) {
      return activityClient.sendHeartbeat(request);
    }
    return assertNever(request, "Invalid activity update request");
  }
);
