import { decodeExecutionId, EventualService } from "@eventual/core/internal";
import { z } from "zod";
import { createExecutionHistoryStateStore } from "../../../create.js";
import { systemCommand } from "../system-command.js";

const executionHistoryStateStore = createExecutionHistoryStateStore();

export const handler = systemCommand<
  EventualService["getExecutionWorkflowHistory"]
>({ inputSchema: z.string() }, async (executionId) => {
  return {
    events: await executionHistoryStateStore.getHistory(
      decodeExecutionId(executionId)
    ),
  };
});
