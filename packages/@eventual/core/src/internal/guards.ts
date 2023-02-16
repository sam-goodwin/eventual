import {
  ActivityUpdateType,
  FailExecutionRequest,
  SendActivityFailureRequest,
  SendActivityHeartbeatRequest,
  SendActivitySuccessRequest,
  SendActivityUpdate,
  SucceedExecutionRequest,
} from "../service-client.js";

export function isSendActivitySuccessRequest<T = any>(
  request: SendActivityUpdate<T>
): request is SendActivitySuccessRequest<T> {
  return request.type === ActivityUpdateType.Success;
}

export function isSendActivityFailureRequest(
  request: SendActivityUpdate
): request is SendActivityFailureRequest {
  return request.type === ActivityUpdateType.Failure;
}

export function isSendActivityHeartbeatRequest(
  request: SendActivityUpdate
): request is SendActivityHeartbeatRequest {
  return request.type === ActivityUpdateType.Heartbeat;
}

export function isFailedExecutionRequest(
  executionRequest: SucceedExecutionRequest | FailExecutionRequest
): executionRequest is FailExecutionRequest {
  return "error" in executionRequest;
}
