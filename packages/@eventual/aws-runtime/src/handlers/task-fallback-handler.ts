import {
  TaskFallbackRequest,
  TaskFallbackRequestType,
  TaskWorkerRequest,
  createTaskFallbackHandler,
} from "@eventual/core-runtime";
import { createExecutionQueueClient } from "../create.js";

const handler = createTaskFallbackHandler({
  executionQueueClient: createExecutionQueueClient(),
});

interface ErrorHandlerRequest {
  requestPayload: TaskWorkerRequest;
  responsePayload: {
    errorMessage: string;
  };
}

export default async (lambdaRequest: ErrorHandlerRequest) => {
  console.log("Received fallback to request: " + JSON.stringify(lambdaRequest));
  try {
    const parsed = JSON.parse(
      lambdaRequest.responsePayload.errorMessage
    ) as TaskFallbackRequest;
    return handler(parsed, lambdaRequest.requestPayload);
  } catch (err) {
    return handler(
      {
        type: TaskFallbackRequestType.TaskSystemFailure,
        errorMessage: lambdaRequest.responsePayload.errorMessage,
      },
      lambdaRequest.requestPayload
    );
  }
};
