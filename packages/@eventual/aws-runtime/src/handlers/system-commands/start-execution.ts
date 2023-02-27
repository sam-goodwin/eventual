import serviceSpec from "@eventual/injected/spec";

import {
  createNewCommand,
  ServiceSpecWorkflowProvider,
} from "@eventual/core-runtime";
import { createWorkflowClient } from "../../create.js";
import { systemCommandWorker } from "./system-command.js";

const workflowProvider = new ServiceSpecWorkflowProvider(serviceSpec);
const workflowClient = createWorkflowClient({
  workflowProvider,
});

// initialize the new command in the worker
export default systemCommandWorker(
  createNewCommand({
    workflowClient,
  })
);
