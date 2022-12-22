import {
  assertNever,
  isActivityHeartbeatMonitorRequest,
  isTimerScheduleEventRequest,
  TimerClient,
  TimerRequest,
} from "@eventual/core";
import { TimeConnector } from "../environment.js";

export class TestTimerClient extends TimerClient {
  constructor(private timeConnector: TimeConnector) {
    super();
  }

  async startShortTimer(timerRequest: TimerRequest): Promise<number> {
    const time =
      timerRequest.schedule.type === "Absolute"
        ? new Date(timerRequest.schedule.untilTime)
        : new Date(
            timerRequest.schedule.baseTime.getTime() +
              timerRequest.schedule.timerSeconds * 1000
          );

    const seconds = (time.getTime() - this.timeConnector.time.getTime()) / 1000;

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
  async startTimer(timerRequest: TimerRequest): Promise<void> {
    await this.startShortTimer(timerRequest);
  }
  // not needed for now
  clearSchedule(_scheduleName: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
