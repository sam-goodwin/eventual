import { decodeExecutionId } from "@eventual/core/internal";
import { z } from "zod";
import { createExecutionHistoryStateStore } from "../../../create.js";
import { systemCommand } from "../system-command.js";

const executionHistoryStateStore = createExecutionHistoryStateStore();

export const handler = systemCommand({ input: z.string() }, (executionId) => {
  return executionHistoryStateStore.getHistory(decodeExecutionId(executionId));
});
