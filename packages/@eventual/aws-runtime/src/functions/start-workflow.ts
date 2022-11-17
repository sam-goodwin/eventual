import { Handler } from "aws-lambda";
import { StartWorkflowRequest } from "../types.js";
import { createWorkflowClient } from "../clients/index.js";

const workflowClient = createWorkflowClient();

export interface StartWorkflowResponse {
  executionId: string;
}

export const handle: Handler<
  StartWorkflowRequest,
  StartWorkflowResponse
> = async (request) => {
  return {
    executionId: await workflowClient.startWorkflow(
      request.input,
      request.name
    ),
  };
};
