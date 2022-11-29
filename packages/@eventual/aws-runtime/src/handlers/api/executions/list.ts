import { createWorkflowRuntimeClient } from "../../../clients/index.js";
import { getService } from "../service-properties.js";
import { withErrorMiddleware } from "../middleware.js";
import { Handler } from "aws-lambda";

async function list() {
  const workflowClient = createWorkflowRuntimeClient(getService());
  return workflowClient.getExecutions();
}

export const handler: Handler = withErrorMiddleware(list);
