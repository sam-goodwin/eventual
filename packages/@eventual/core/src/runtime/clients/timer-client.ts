import { HistoryStateEvent } from "../../events.js";

export interface TimerClient {
  /**
   * Starts a timer using SQS's message delay.
   *
   * The timerRequest.untilTime may only be 15 minutes or fewer in the future.
   *
   * For longer use {@link TimerClient.startTimer}.
   *
   * The SQS Queue will delay for floor(untilTime - currentTime) seconds until the timer handler can pick up the message.
   *
   * Finally the timer handler waits the remaining (untilTime - currentTime) milliseconds if necessary and then sends
   * the {@link TimerRequest} provided.
   */
  startShortTimer(timerRequest: TimerRequest): Promise<number>;

  /**
   * Starts a timer of any (positive) length.
   *
   * If the timer is longer than 15 minutes (configurable via `props.sleepQueueThresholdMillis`),
   * the timer will create a  EventBridge schedule until the untilTime - props.sleepQueueThresholdMillis
   * when the timer will be moved to the SQS queue.
   *
   * The SQS Queue will delay for floor(untilTime - currentTime) seconds until the timer handler can pick up the message.
   *
   * Finally the timer handler waits the remaining (untilTime - currentTime) milliseconds if necessary and then sends
   * the {@link TimerRequest} provided.
   */
  startTimer(timerRequest: TimerRequest): Promise<void>;

  /**
   * When startTimer is used, the EventBridge schedule will not self delete.
   *
   * Use this method to clean the schedule.
   *
   * The provided schedule-forwarder function will call this method in Eventual when
   * the timer is transferred from EventBridge to SQS at `props.sleepQueueThresholdMillis`.
   */
  clearSchedule(scheduleName: string): Promise<void>;

  /**
   * Schedules any event for a workflow at a future time.
   *
   * Helper for using {@link TimerClient.startTimer} with a {@link TimerScheduleEventRequest}.
   */
  scheduleEvent<E extends HistoryStateEvent>(
    request: ScheduleEventRequest<E>
  ): Promise<void>;
}

export type TimerRequest =
  | TimerScheduleEventRequest
  | ActivityHeartbeatMonitorRequest;

export enum TimerRequestType {
  ScheduleEvent = "ScheduleEvent",
  ActivityHeartbeatMonitor = "CheckHeartbeat",
}

export type TimerRequestBase<T extends TimerRequestType> = {
  type: T;
  schedule:
    | {
        timerSeconds: number;
        baseTime: Date;
      }
    | {
        untilTime: string;
      };
};

/**
 * Forward an event to the Workflow Queue.
 */
export interface TimerScheduleEventRequest
  extends TimerRequestBase<TimerRequestType.ScheduleEvent> {
  executionId: string;
  event: HistoryStateEvent;
}

export function isTimerScheduleEventRequest(
  timerRequest: TimerRequest
): timerRequest is TimerScheduleEventRequest {
  return timerRequest && timerRequest.type === TimerRequestType.ScheduleEvent;
}

export type ActivityHeartbeatMonitorRequest =
  TimerRequestBase<TimerRequestType.ActivityHeartbeatMonitor> & {
    executionId: string;
    activitySeq: number;
    heartbeatSeconds: number;
  };

export function isActivityHeartbeatMonitorRequest(
  timerRequest: TimerRequest
): timerRequest is ActivityHeartbeatMonitorRequest {
  return (
    timerRequest &&
    timerRequest.type === TimerRequestType.ActivityHeartbeatMonitor
  );
}

export interface ScheduleForwarderRequest {
  scheduleName: string;
  clearSchedule: boolean;
  timerRequest: TimerRequest;
  forwardTime: string;
  /**
   * ISO 8601 Timestamp determining when the message should be visible to the timer queue.
   */
  untilTime: string;
}

export interface ScheduleEventRequest<E extends HistoryStateEvent>
  extends Omit<TimerScheduleEventRequest, "event" | "type"> {
  event: Omit<E, "timestamp">;
}
