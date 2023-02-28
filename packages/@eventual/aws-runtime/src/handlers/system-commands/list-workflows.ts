import serviceSpec from "@eventual/injected/spec";

import {
  createListWorkflowsCommand,
  ServiceSpecWorkflowProvider,
} from "@eventual/core-runtime";
import { systemCommandWorker } from "./system-command.js";

export default systemCommandWorker(
  createListWorkflowsCommand({
    workflowProvider: new ServiceSpecWorkflowProvider(serviceSpec),
  })
);
