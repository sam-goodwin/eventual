import { createListExecutionsCommand } from "@eventual/core-runtime";
import { createExecutionStore } from "../../create.js";
import { systemCommandWorker } from "./system-command.js";

export default systemCommandWorker(
  createListExecutionsCommand({
    executionStore: createExecutionStore(),
  })
);
