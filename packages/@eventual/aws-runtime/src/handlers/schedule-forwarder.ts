import { metricScope } from "aws-embedded-metrics";
import { logger } from "../logger.js";
import { createTimerClient } from "../clients/create.js";
import {
  MetricsCommon,
  SchedulerForwarderMetrics,
} from "../metrics/constants.js";
import { TimerRequest } from "@eventual/core";

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

const timerClient = createTimerClient({
  scheduleForwarderArn: "NOT NEEDED",
});

export const handle = metricScope(
  (metrics) => async (event: ScheduleForwarderRequest) => {
    metrics.setNamespace(MetricsCommon.EventualNamespace);

    const executionLogger = logger.createChild({
      persistentLogAttributes: { executionId: event.timerRequest.executionId },
    });

    executionLogger.debug(
      "Forwarding request to the timer queue: " +
        JSON.stringify(event.timerRequest)
    );

    const schedulerTimeDelay =
      new Date().getTime() - new Date(event.forwardTime).getTime();

    executionLogger.info(
      `Timer Time: ${event.untilTime}. Forwarded Time: ${event.forwardTime}. ${schedulerTimeDelay} Millisecond delay from scheduler.`
    );

    metrics.setProperty(
      SchedulerForwarderMetrics.SchedulerTimeDelay,
      schedulerTimeDelay
    );

    const delaySeconds = await timerClient.startShortTimer(event.timerRequest);

    metrics.setProperty(
      SchedulerForwarderMetrics.TimerQueueDelaySeconds,
      delaySeconds
    );

    if (event.clearSchedule) {
      console.debug("Deleting the schedule: " + event.scheduleName);
      await timerClient.clearSchedule(event.scheduleName);
    }
  }
);
