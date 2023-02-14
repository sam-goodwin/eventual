import {
  ActivityFallbackRequest,
  ActivityFallbackRequestType,
  ActivityWorkerRequest,
  createActivityFallbackHandler,
} from "@eventual/runtime-core";
import { createExecutionQueueClient } from "../create.js";

const handler = createActivityFallbackHandler({
  executionQueueClient: createExecutionQueueClient(),
});

interface ErrorHandlerRequest {
  requestPayload: ActivityWorkerRequest;
  responsePayload: {
    errorMessage: string;
  };
}

export default async (lambdaRequest: ErrorHandlerRequest) => {
  console.log("Received fallback to request: " + JSON.stringify(lambdaRequest));
  try {
    const parsed = JSON.parse(
      lambdaRequest.responsePayload.errorMessage
    ) as ActivityFallbackRequest;
    return handler(parsed, lambdaRequest.requestPayload);
  } catch (err) {
    return handler(
      {
        type: ActivityFallbackRequestType.ActivitySystemFailure,
        errorMessage: lambdaRequest.responsePayload.errorMessage,
      },
      lambdaRequest.requestPayload
    );
  }
};
