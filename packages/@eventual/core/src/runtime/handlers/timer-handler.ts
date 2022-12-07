import { isTimerScheduleEventRequest, TimerRequest } from "../clients/timer-client.js";
import type { WorkflowClient } from "../clients/workflow-client.js";

/**
 * Creates a generic function for handling {@link TimerRequest}s
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createTimerHandler(workflowClient: WorkflowClient) {
  return async (request: TimerRequest) => {
    if (isTimerScheduleEventRequest(request)) {
      await workflowClient.submitWorkflowTask(
        request.executionId,
        request.event
      );
    }
  };
}
