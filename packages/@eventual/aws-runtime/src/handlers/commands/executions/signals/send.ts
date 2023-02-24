import {
  EventualService,
  sendSignalRequestSchema,
} from "@eventual/core/internal";
import { createExecutionQueueClient } from "../../../../create.js";
import { systemCommand } from "../../system-command.js";

const executionQueueClient = createExecutionQueueClient();

export const handler = systemCommand<EventualService["sendSignal"]>(
  { inputSchema: sendSignalRequestSchema },
  async (request) => {
    return await executionQueueClient.sendSignal({
      id: request.id,
      payload: request.payload,
      execution: request.executionId,
      signal: request.signalId,
    });
  }
);
