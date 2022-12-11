import {
  ActivityHeartbeatTimedOut,
  createEvent,
  WorkflowEventType,
} from "../../events.js";
import { assertNever } from "../../util.js";
import {
  isActivityHeartbeatMonitorRequest,
  isTimerScheduleEventRequest,
  Schedule,
  TimerClient,
  TimerRequest,
  TimerRequestType,
} from "../clients/timer-client.js";
import type { WorkflowClient } from "../clients/workflow-client.js";
import { ActivityRuntimeClient, Logger } from "../index.js";

interface TimerHandlerProps {
  workflowClient: WorkflowClient;
  activityRuntimeClient: ActivityRuntimeClient;
  timerClient: TimerClient;
  logger: Logger;
}

/**
 * Creates a generic function for handling {@link TimerRequest}s
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createTimerHandler({
  workflowClient,
  activityRuntimeClient,
  timerClient,
  logger,
}: TimerHandlerProps) {
  return async (request: TimerRequest) => {
    if (isTimerScheduleEventRequest(request)) {
      await workflowClient.submitWorkflowTask(
        request.executionId,
        request.event
      );
    } else if (isActivityHeartbeatMonitorRequest(request)) {
      const activity = await activityRuntimeClient.getActivity(
        request.executionId,
        request.activitySeq
      );

      logger.debug(
        `checking activity for heartbeat timeout: ${JSON.stringify(activity)}`
      );

      // the activity has not sent a heartbeat or the last time was too long ago.
      // Send the timeout event to the workflow.
      if (
        !activity?.heartbeatTime ||
        isHeartbeatTimeElapsed(activity.heartbeatTime, request.heartbeatSeconds)
      ) {
        return workflowClient.submitWorkflowTask(
          request.executionId,
          createEvent<ActivityHeartbeatTimedOut>({
            type: WorkflowEventType.ActivityHeartbeatTimedOut,
            seq: request.activitySeq,
          })
        );
      } else {
        // activity heartbeat has not timed out, start a new monitor instance
        await timerClient.startTimer({
          type: TimerRequestType.ActivityHeartbeatMonitor,
          activitySeq: request.activitySeq,
          executionId: request.executionId,
          heartbeatSeconds: request.heartbeatSeconds,
          schedule: Schedule.relative(request.heartbeatSeconds),
        });
      }
    } else {
      assertNever(request);
    }
  };
}

function isHeartbeatTimeElapsed(
  lastHeartbeatTime: string,
  heartbeatSeconds: number
) {
  const durationMillis =
    new Date().getTime() - new Date(lastHeartbeatTime).getTime();

  return heartbeatSeconds * 1000 < durationMillis;
}
