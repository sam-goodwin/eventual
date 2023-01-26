import type {
  StartExecutionRequest,
  StartExecutionResponse,
} from "@eventual/core";
import { Handler } from "aws-lambda";
import { createWorkflowClient } from "../create.js";

const workflowClient = createWorkflowClient();

export const handle: Handler<
  StartExecutionRequest,
  StartExecutionResponse
> = async (request) => {
  return workflowClient.startExecution(request);
};
