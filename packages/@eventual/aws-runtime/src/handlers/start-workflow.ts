import { Handler } from "aws-lambda";
import type {
  StartExecutionRequest,
  StartWorkflowResponse,
} from "@eventual/core";
import { createWorkflowClient } from "../clients/index.js";

const workflowClient = createWorkflowClient();

export const handle: Handler<
  StartExecutionRequest,
  StartWorkflowResponse
> = async (request) => {
  return {
    executionId: await workflowClient.startWorkflow(request),
  };
};
