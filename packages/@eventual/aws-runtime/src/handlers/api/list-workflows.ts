import serviceSpec from "@eventual/injected/spec";

import { ServiceSpecWorkflowProvider } from "@eventual/runtime-core";
import { withErrorMiddleware } from "./middleware.js";

const workflowProvider = new ServiceSpecWorkflowProvider(serviceSpec);

export const handler = withErrorMiddleware(async function () {
  return Array.from(workflowProvider.getWorkflowNames());
});
