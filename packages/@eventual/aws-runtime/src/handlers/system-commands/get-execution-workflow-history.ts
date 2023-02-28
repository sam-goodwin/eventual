import { createListWorkflowHistoryCommand } from "@eventual/core-runtime";
import { createExecutionHistoryStateStore } from "../../create.js";
import { systemCommandWorker } from "./system-command.js";

export default systemCommandWorker(
  createListWorkflowHistoryCommand({
    executionHistoryStateStore: createExecutionHistoryStateStore(),
  })
);
