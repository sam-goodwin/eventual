import { createWorkflowClient } from "../../../clients/index.js";
import { getService } from "../service-properties.js";
import { withErrorMiddleware } from "../middleware.js";

async function list() {
  const workflowClient = createWorkflowClient(getService());
  return workflowClient.getExecutions();
}

export const handler = withErrorMiddleware(list);
