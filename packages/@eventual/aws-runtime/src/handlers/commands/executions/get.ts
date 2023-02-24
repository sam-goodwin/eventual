import { EventualService } from "@eventual/core/internal";
import { z } from "zod";
import { createExecutionStore } from "../../../create.js";
import { systemCommand } from "../system-command.js";

const executionStore = createExecutionStore();

export const handler = systemCommand<EventualService["getExecution"]>(
  { inputSchema: z.string() },
  async (request) => {
    return executionStore.get(request);
  }
);
