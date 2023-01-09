import type { MetricsClient } from "../clients/metrics-client.js";
import type {
  ScheduleForwarderRequest,
  TimerClient,
} from "../clients/timer-client.js";
import { ExecutionLogContext, LogAgent, LogContextType } from "../log-agent.js";
import {
  MetricsCommon,
  SchedulerForwarderMetrics,
} from "../metrics/constants.js";

/**
 * The Schedule Forwarder's dependencies.
 */
export interface ScheduleForwarderDependencies {
  timerClient: TimerClient;
  metricsClient: MetricsClient;
  logAgent: LogAgent;
}

/**
 * Creates a generic function for forwarding scheduled events to a queue
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createScheduleForwarder({
  timerClient,
  metricsClient,
  logAgent,
}: ScheduleForwarderDependencies) {
  return metricsClient.metricScope(
    (metrics) => async (event: ScheduleForwarderRequest) => {
      metrics.setNamespace(MetricsCommon.EventualNamespace);

      // log on behalf of the execution.
      const executionLogContext: ExecutionLogContext = {
        type: LogContextType.Execution,
        executionId: event.timerRequest.executionId,
      };

      logAgent.logWithContext(
        executionLogContext,
        "DEBUG",
        "Forwarding request to the timer queue: " +
          JSON.stringify(event.timerRequest)
      );

      const schedulerTimeDelay =
        new Date().getTime() - new Date(event.forwardTime).getTime();

      logAgent.logWithContext(
        executionLogContext,
        "DEBUG",
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
        logAgent.logWithContext(
          executionLogContext,
          "DEBUG",
          "Deleting the schedule: " + event.scheduleName
        );
        await timerClient.clearSchedule(event.scheduleName);
      }
    }
  );
}
