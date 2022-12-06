import type { MetricsClient } from "../clients/metrics-client.js";
import type {
  ScheduleForwarderRequest,
  TimerClient,
} from "../clients/timer-client.js";
import { LoggerClient } from "../index.js";
import {
  MetricsCommon,
  SchedulerForwarderMetrics,
} from "../metrics/constants.js";

export function createScheduleForwarder(
  timerClient: TimerClient,
  metricsClient: MetricsClient,
  loggerClient: LoggerClient
) {
  const logger = loggerClient.getLogger();

  return metricsClient.metricScope(
    (metrics) => async (event: ScheduleForwarderRequest) => {
      metrics.setNamespace(MetricsCommon.EventualNamespace);

      const executionLogger = logger.createChild({
        persistentLogAttributes: {
          executionId: event.timerRequest.executionId,
        },
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

      const delaySeconds = await timerClient.startShortTimer(
        event.timerRequest
      );

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
}
