import { HistoryStateEvent } from "../events.js";

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
}

export type TimerRequest = TimerForwardEventRequest;

export enum TimerRequestType {
  ForwardEvent = "ForwardEvent",
}

export interface TimerRequestBase<T extends TimerRequestType> {
  type: T;
  untilTime: string;
}

/**
 * Forward an event to the Workflow Queue.
 */
export interface TimerForwardEventRequest
  extends TimerRequestBase<TimerRequestType.ForwardEvent> {
  executionId: string;
  event: HistoryStateEvent;
}

export function isTimerForwardEventRequest(
  timerRequest: TimerRequest
): timerRequest is TimerForwardEventRequest {
  return timerRequest && timerRequest.type === TimerRequestType.ForwardEvent;
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