import { createListExecutionHistoryCommand } from "@eventual/core-runtime";
import { createExecutionHistoryStore } from "../../create.js";
import { systemCommandWorker } from "./system-command.js";

export default systemCommandWorker(
  createListExecutionHistoryCommand({
    executionHistoryStore: createExecutionHistoryStore(),
  })
);
