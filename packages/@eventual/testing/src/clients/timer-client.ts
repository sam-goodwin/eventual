import {
  assertNever,
  computeScheduleDate,
  isActivityHeartbeatMonitorRequest,
  isTimerScheduleEventRequest,
  TimerClient,
  TimerRequest,
} from "@eventual/core";
import { TimeConnector } from "../environment.js";

export class TestTimerClient extends TimerClient {
  constructor(private timeConnector: TimeConnector) {
    super(() => timeConnector.getTime());
  }

  public async startShortTimer(timerRequest: TimerRequest): Promise<number> {
    const time = computeScheduleDate(timerRequest.schedule, this.baseTime());

    const seconds =
      (time.getTime() - this.timeConnector.getTime().getTime()) / 1000;

    if (isTimerScheduleEventRequest(timerRequest)) {
      this.timeConnector.scheduleEvent(time, {
        executionId: timerRequest.executionId,
        events: [timerRequest.event],
      });
    } else if (isActivityHeartbeatMonitorRequest(timerRequest)) {
      throw new Error(
        "Heartbeat timeout is not yet implemented for the Test Environment."
      );
    } else {
      return assertNever(timerRequest);
    }

    return seconds;
  }

  public async startTimer(timerRequest: TimerRequest): Promise<void> {
    await this.startShortTimer(timerRequest);
  }

  // not needed for now
  public clearSchedule(_scheduleName: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
