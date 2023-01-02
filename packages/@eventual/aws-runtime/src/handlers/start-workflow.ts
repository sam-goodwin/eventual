import { Handler } from "aws-lambda";
import type {
  StartExecutionRequest,
  StartExecutionResponse,
} from "@eventual/core";
import { createWorkflowClient } from "../clients/index.js";

const workflowClient = createWorkflowClient();

export const handle: Handler<
  StartExecutionRequest,
  StartExecutionResponse
> = async (request) => {
  return workflowClient.startExecution(request);
};
