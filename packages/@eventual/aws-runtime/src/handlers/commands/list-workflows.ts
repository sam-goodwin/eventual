import serviceSpec from "@eventual/injected/spec";

import { ServiceSpecWorkflowProvider } from "@eventual/core-runtime";
import { systemCommand } from "./system-command.js";
import { EventualService } from "@eventual/core/internal";

const workflowProvider = new ServiceSpecWorkflowProvider(serviceSpec);

export const handler = systemCommand<EventualService["listWorkflows"]>(() => ({
  workflows: Array.from(workflowProvider.getWorkflowNames()).map((w) => ({
    name: w,
  })),
}));
