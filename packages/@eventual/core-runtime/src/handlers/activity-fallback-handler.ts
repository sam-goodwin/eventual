import {
  ActivityFailed,
  ActivitySucceeded,
  WorkflowEventType,
} from "@eventual/core";
import { assertNever } from "@eventual/core/internal";
import { ActivityWorkerRequest } from "../clients/activity-client.js";
import { ExecutionQueueClient } from "../clients/execution-queue-client.js";

export interface ActivityFallbackHandlerProps {
  baseTime?: () => Date;
  executionQueueClient: ExecutionQueueClient;
}

export enum ActivityFallbackRequestType {
  ActivitySendEventFailure = 0,
  ActivitySystemFailure = 1,
}

export type ActivityFallbackRequest =
  | ActivitySendEventRequest
  | ActivitySystemFailure;

export interface ActivitySendEventRequest {
  type: ActivityFallbackRequestType.ActivitySendEventFailure;
  executionId: string;
  event: ActivitySucceeded | ActivityFailed;
}

export function isActivitySendEventRequest(
  request: ActivityFallbackRequest
): request is ActivitySendEventRequest {
  return request.type === ActivityFallbackRequestType.ActivitySendEventFailure;
}

export interface ActivitySystemFailure {
  type: ActivityFallbackRequestType.ActivitySystemFailure;
  errorMessage: string;
}

export function isActivitySystemFailure(
  request: ActivityFallbackRequest
): request is ActivitySystemFailure {
  return request.type === ActivityFallbackRequestType.ActivitySystemFailure;
}

export interface ActivityFallbackHandler {
  (
    fallbackRequest: ActivityFallbackRequest,
    activityRequest: ActivityWorkerRequest
  ): Promise<void>;
}

/**
 * Handles secondary actions from activities like sending events
 * when the activity handler may not be able to do so during execution.
 *
 * For example, if the activity handler fails to submit a result to the workflow,
 * try to submit from here.
 *
 * TODO: support retries
 */
export function createActivityFallbackHandler({
  executionQueueClient,
  baseTime = () => new Date(),
}: ActivityFallbackHandlerProps): ActivityFallbackHandler {
  return async (request, activityRequest) => {
    if (isActivitySendEventRequest(request)) {
      return await executionQueueClient.submitExecutionEvents(
        request.executionId,
        request.event
      );
    } else if (isActivitySystemFailure(request)) {
      return await executionQueueClient.submitExecutionEvents(
        activityRequest.executionId,
        {
          type: WorkflowEventType.ActivityFailed,
          error: "Error",
          seq: activityRequest.command.seq,
          timestamp: baseTime().toISOString(),
        }
      );
    }
    return assertNever(request);
  };
}
