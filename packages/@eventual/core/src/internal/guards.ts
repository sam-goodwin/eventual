import {
  FailExecutionRequest,
  SucceedExecutionRequest,
} from "../service-client.js";

export function isFailedExecutionRequest(
  executionRequest: SucceedExecutionRequest | FailExecutionRequest
): executionRequest is FailExecutionRequest {
  return "error" in executionRequest;
}
