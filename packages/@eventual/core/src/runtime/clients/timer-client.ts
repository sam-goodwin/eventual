import { HistoryStateEvent } from "../../workflow-events.js";

export abstract class TimerClient {
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
  abstract startShortTimer(timerRequest: TimerRequest): Promise<number>;

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
  abstract startTimer(timerRequest: TimerRequest): Promise<void>;

  /**
   * When startTimer is used, the EventBridge schedule will not self delete.
   *
   * Use this method to clean the schedule.
   *
   * The provided schedule-forwarder function will call this method in Eventual when
   * the timer is transferred from EventBridge to SQS at `props.sleepQueueThresholdMillis`.
   */
  abstract clearSchedule(scheduleName: string): Promise<void>;

  /**
   * Schedules any event for a workflow at a future time.
   *
   * Helper for using {@link TimerClient.startTimer} with a {@link TimerScheduleEventRequest}.
   */
  public async scheduleEvent<E extends HistoryStateEvent>(
    request: ScheduleEventRequest<E>
  ): Promise<void> {
    const untilTime = computeUntilTime(request.schedule);

    const event = {
      ...request.event,
      timestamp: untilTime,
    } as E;

    await this.startTimer({
      event,
      executionId: request.executionId,
      type: TimerRequestType.ScheduleEvent,
      schedule: Schedule.absolute(untilTime),
    });
  }
}

export type TimerRequest =
  | TimerScheduleEventRequest
  | ActivityHeartbeatMonitorRequest;

export enum TimerRequestType {
  ScheduleEvent = "ScheduleEvent",
  ActivityHeartbeatMonitor = "CheckHeartbeat",
}

export interface RelativeSchedule {
  type: "Relative";
  timerSeconds: number;
  baseTime: Date;
}

export interface AbsoluteSchedule {
  type: "Absolute";
  untilTime: string;
}

export type Schedule = RelativeSchedule | AbsoluteSchedule;

export namespace Schedule {
  export function relative(
    timerSeconds: number,
    baseTime: Date = new Date()
  ): RelativeSchedule {
    return {
      type: "Relative",
      timerSeconds,
      baseTime,
    };
  }

  export function absolute(untilTime: string): AbsoluteSchedule {
    return {
      type: "Absolute",
      untilTime,
    };
  }
}

export type TimerRequestBase<T extends TimerRequestType> = {
  type: T;
  schedule: Schedule;
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

export function computeUntilTime(schedule: TimerRequest["schedule"]): string {
  return "untilTime" in schedule
    ? schedule.untilTime
    : new Date(
        schedule.baseTime.getTime() + schedule.timerSeconds * 1000
      ).toISOString();
}
