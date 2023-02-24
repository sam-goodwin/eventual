import serviceSpec from "@eventual/injected/spec";

import { ServiceSpecWorkflowProvider } from "@eventual/core-runtime";
import { createWorkflowClient } from "../../../create.js";
import { systemCommand } from "../system-command.js";
import { EventualService, startExecutionRequestSchema } from "@eventual/core/internal";

const workflowProvider = new ServiceSpecWorkflowProvider(serviceSpec);
const workflowClient = createWorkflowClient({
  workflowProvider,
});

/**
 * Create a new execution (start a workflow)
 *
 * Path Parameters;
 * * workflowName - name of the workflow to start
 *
 * Query Parameters:
 * * timeout - Number of `timeoutUnit` (default seconds) the workflow should run before it times out. Default: use the configured timeout or no timeout.
 * * timeoutUnit - "seconds" | "minutes" | "hours" | "days" | "years". Units to use for the timeout, default: "seconds".
 * * executionName - name to give the workflow. Default: auto generated UUID.
 */
export const handler = systemCommand<EventualService["startExecution"]>(
  { inputSchema: startExecutionRequestSchema },
  async (request) => {
    return await workflowClient.startExecution({
      input: request.input,
      workflow: request.workflow,
      executionName: request.executionName,
      timeout: request.timeout,
    });
  }
);
