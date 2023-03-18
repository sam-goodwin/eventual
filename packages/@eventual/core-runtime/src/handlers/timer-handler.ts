import { LogLevel, Schedule } from "@eventual/core";
import {
  ActivityHeartbeatTimedOut,
  assertNever,
  WorkflowEventType,
} from "@eventual/core/internal";
import type { ExecutionQueueClient } from "../clients/execution-queue-client.js";
import {
  isActivityHeartbeatMonitorRequest,
  isTimerScheduleEventRequest,
  TimerClient,
  TimerRequest,
  TimerRequestType,
} from "../clients/timer-client.js";
import type { LogAgent } from "../log-agent.js";
import type { ActivityStore } from "../stores/activity-store.js";
import { createEvent } from "../workflow-events.js";

interface TimerHandlerProps {
  timerClient: TimerClient;
  logAgent: LogAgent;
  executionQueueClient: ExecutionQueueClient;
  activityStore: ActivityStore;
  baseTime?: () => Date;
}

export interface TimerHandler {
  (request: TimerRequest): Promise<void>;
}

/**
 * Creates a generic function for handling {@link TimerRequest}s
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createTimerHandler({
  activityStore,
  executionQueueClient,
  logAgent,
  timerClient,
  baseTime = () => new Date(),
}: TimerHandlerProps): TimerHandler {
  return async (request) => {
    try {
      if (isTimerScheduleEventRequest(request)) {
        logAgent.logWithContext(
          { executionId: request.executionId },
          LogLevel.DEBUG,
          [`Forwarding event: ${request.event}.`]
        );

        await executionQueueClient.submitExecutionEvents(
          request.executionId,
          request.event
        );
      } else if (isActivityHeartbeatMonitorRequest(request)) {
        const activity = await activityStore.get(
          request.executionId,
          request.activitySeq
        );

        logAgent.logWithContext(
          { executionId: request.executionId },
          LogLevel.DEBUG,
          () => [
            `Checking activity for heartbeat timeout: ${JSON.stringify(
              activity
            )}`,
          ]
        );

        // the activity has not sent a heartbeat or the last time was too long ago.
        // Send the timeout event to the workflow.
        if (
          !activity?.heartbeatTime ||
          isHeartbeatTimeElapsed(
            activity.heartbeatTime,
            request.heartbeatSeconds,
            baseTime()
          )
        ) {
          return executionQueueClient.submitExecutionEvents(
            request.executionId,
            createEvent<ActivityHeartbeatTimedOut>(
              {
                type: WorkflowEventType.ActivityHeartbeatTimedOut,
                seq: request.activitySeq,
              },
              baseTime()
            )
          );
        } else {
          // activity heartbeat has not timed out, start a new monitor instance
          await timerClient.startTimer({
            type: TimerRequestType.ActivityHeartbeatMonitor,
            activitySeq: request.activitySeq,
            executionId: request.executionId,
            heartbeatSeconds: request.heartbeatSeconds,
            schedule: Schedule.duration(request.heartbeatSeconds),
          });
        }
      } else {
        assertNever(request);
      }
    } finally {
      await logAgent.flush();
    }
  };
}

function isHeartbeatTimeElapsed(
  lastHeartbeatTime: string,
  heartbeatSeconds: number,
  currentDate: Date
) {
  const durationMillis =
    currentDate.getTime() - new Date(lastHeartbeatTime).getTime();

  return heartbeatSeconds * 1000 < durationMillis;
}
