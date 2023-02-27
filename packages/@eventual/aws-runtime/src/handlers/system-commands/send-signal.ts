import { createSendSignalCommand } from "@eventual/core-runtime";
import { createExecutionQueueClient } from "../../create.js";
import { systemCommandWorker } from "./system-command.js";

export default systemCommandWorker(
  createSendSignalCommand({
    executionQueueClient: createExecutionQueueClient(),
  })
);
