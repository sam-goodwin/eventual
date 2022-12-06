import {
  isTimerForwardEventRequest,
  TimerRequest,
} from "../clients/timer-client.js";
import type { WorkflowClient } from "../clients/workflow-client.js";

export function createTimerHandler(workflowClient: WorkflowClient) {
  return async (request: TimerRequest) => {
    if (isTimerForwardEventRequest(request)) {
      await workflowClient.submitWorkflowTask(
        request.executionId,
        request.event
      );
    }
  };
}
