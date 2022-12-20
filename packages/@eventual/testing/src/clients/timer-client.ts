import {
  HistoryStateEvent,
  ScheduleEventRequest,
  TimerClient,
  TimerRequest,
} from "@eventual/core";

export class TestTimerClient implements TimerClient {
  startShortTimer(_timerRequest: TimerRequest): Promise<number> {
    throw new Error("Method not implemented.");
  }
  startTimer(_timerRequest: TimerRequest): Promise<void> {
    throw new Error("Method not implemented.");
  }
  // not needed for now
  clearSchedule(_scheduleName: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  scheduleEvent<E extends HistoryStateEvent>(
    _request: ScheduleEventRequest<E>
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
