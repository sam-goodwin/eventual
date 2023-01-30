import appSpec from "@eventual/injected/spec";

import { withErrorMiddleware } from "./middleware.js";
import { AppSpecWorkflowProvider } from "@eventual/runtime-core";

const workflowProvider = new AppSpecWorkflowProvider(appSpec);

export const handler = withErrorMiddleware(async function () {
  return Array.from(workflowProvider.getWorkflowNames());
});
