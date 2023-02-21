import serviceSpec from "@eventual/injected/spec";

import { ServiceSpecWorkflowProvider } from "@eventual/core-runtime";
import { systemCommand } from "./system-command.js";

const workflowProvider = new ServiceSpecWorkflowProvider(serviceSpec);

export const handler = systemCommand(() =>
  Array.from(workflowProvider.getWorkflowNames())
);
