import {
  ActivityHeartbeatTimedOut,
  createEvent,
  WorkflowEventType,
} from "../../workflow-events.js";
import { assertNever } from "../../util.js";
import {
  isActivityHeartbeatMonitorRequest,
  isTimerScheduleEventRequest,
  TimerClient,
  TimerRequest,
  TimerRequestType,
} from "../clients/timer-client.js";
import type { WorkflowClient } from "../clients/workflow-client.js";
import { ActivityRuntimeClient } from "../clients/activity-runtime-client.js";
import { LogAgent, LogContextType, LogLevel } from "../log-agent.js";
import { Schedule } from "../../schedule.js";

interface TimerHandlerProps {
  workflowClient: WorkflowClient;
  activityRuntimeClient: ActivityRuntimeClient;
  timerClient: TimerClient;
  logAgent: LogAgent;
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
  logAgent,
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

      logAgent.logWithContext(
        { type: LogContextType.Execution, executionId: request.executionId },
        LogLevel.DEBUG,
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
          createEvent<ActivityHeartbeatTimedOut>(
            {
              type: WorkflowEventType.ActivityHeartbeatTimedOut,
              seq: request.activitySeq,
            },
            new Date()
          )
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
