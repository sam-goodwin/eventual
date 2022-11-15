import { Handler } from "aws-lambda";
import { createWorkflowClient } from "../clients/index.js";

const workflowClient = createWorkflowClient();

export interface StartWorkflowRequest {
  name: string;
  input: any;
}

export interface StartWorkflowResponse {
  executionId: string;
}

export const handle: Handler<
  StartWorkflowRequest,
  StartWorkflowResponse
> = async (request) => {
  return {
    executionId: await workflowClient.startWorkflow(request),
  };
};
