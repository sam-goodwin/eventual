import {
  TaskFailed,
  TaskSucceeded,
  WorkflowEventType,
  assertNever,
} from "@eventual/core/internal";
import type { ExecutionQueueClient } from "../clients/execution-queue-client.js";
import type { TaskWorkerRequest } from "../clients/task-client.js";

export interface TaskFallbackHandlerProps {
  baseTime?: () => Date;
  executionQueueClient: ExecutionQueueClient;
}

export enum TaskFallbackRequestType {
  TaskSendEventFailure = 0,
  TaskSystemFailure = 1,
}

export type TaskFallbackRequest = TaskSendEventRequest | TaskSystemFailure;

export interface TaskSendEventRequest {
  type: TaskFallbackRequestType.TaskSendEventFailure;
  executionId: string;
  event: TaskSucceeded | TaskFailed;
}

export function isTaskSendEventRequest(
  request: TaskFallbackRequest
): request is TaskSendEventRequest {
  return request.type === TaskFallbackRequestType.TaskSendEventFailure;
}

export interface TaskSystemFailure {
  type: TaskFallbackRequestType.TaskSystemFailure;
  errorMessage: string;
}

export function isTaskSystemFailure(
  request: TaskFallbackRequest
): request is TaskSystemFailure {
  return request.type === TaskFallbackRequestType.TaskSystemFailure;
}

export interface TaskFallbackHandler {
  (
    fallbackRequest: TaskFallbackRequest,
    taskRequest: TaskWorkerRequest
  ): Promise<void>;
}

/**
 * Handles secondary actions from tasks like sending events
 * when the task handler may not be able to do so during execution.
 *
 * For example, if the task handler fails to submit a result to the workflow,
 * try to submit from here.
 *
 * TODO: support retries
 */
export function createTaskFallbackHandler({
  executionQueueClient,
  baseTime = () => new Date(),
}: TaskFallbackHandlerProps): TaskFallbackHandler {
  return async (request, taskRequest) => {
    if (isTaskSendEventRequest(request)) {
      return await executionQueueClient.submitExecutionEvents(
        request.executionId,
        request.event
      );
    } else if (isTaskSystemFailure(request)) {
      return await executionQueueClient.submitExecutionEvents(
        taskRequest.executionId,
        {
          type: WorkflowEventType.TaskFailed,
          error: "Error",
          seq: taskRequest.seq,
          timestamp: baseTime().toISOString(),
        }
      );
    }
    return assertNever(request);
  };
}
