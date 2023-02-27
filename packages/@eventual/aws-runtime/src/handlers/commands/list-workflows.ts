import serviceSpec from "@eventual/injected/spec";

import { ServiceSpecWorkflowProvider } from "@eventual/core-runtime";
import { EventualService } from "@eventual/core/internal";
import { systemCommand } from "./system-command.js";

const workflowProvider = new ServiceSpecWorkflowProvider(serviceSpec);

export const handler = systemCommand<EventualService["listWorkflows"]>(() => ({
  workflows: Array.from(workflowProvider.getWorkflowNames()).map((w) => ({
    name: w,
  })),
}));
