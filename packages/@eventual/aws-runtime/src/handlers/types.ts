import { HistoryStateEvent } from "@eventual/core";

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
