import { DeleteScheduleCommand } from "@aws-sdk/client-scheduler";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { metricScope } from "aws-embedded-metrics";
import { scheduler, sqs } from "src/clients";
import { schedulerGroup, timerQueueArn } from "src/env";
import {
  MetricsCommon,
  SchedulerForwarderMetrics,
} from "src/metrics/constants";
import { TimerRequest } from "./timer-handler";

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

const sqsClient = sqs();
const schedulerClient = scheduler();
const timerQueueUrl = timerQueueArn();
const schedulerGroupName = schedulerGroup();

export const handle = metricScope(
  (metrics) => async (event: ScheduleForwarderRequest) => {
    metrics.setNamespace(MetricsCommon.EventualNamespace);

    console.debug(
      "Forwarding request to the timer queue: " +
        JSON.stringify(event.timerRequest)
    );

    const schedulerTimeDelay =
      new Date().getTime() - new Date(event.forwardTime).getTime();

    console.log(
      `Timer Time: ${event.untilTime}. Forwarded Time: ${event.forwardTime}. ${schedulerTimeDelay} Millisecond delay from scheduler.`
    );

    metrics.setProperty(
      SchedulerForwarderMetrics.SchedulerTimeDelay,
      schedulerTimeDelay
    );

    // should we let the timer handler account for the extra milliseconds?
    const delaySeconds = Math.ceil(
      (new Date().getTime() - new Date(event.untilTime).getTime()) / 1000
    );

    metrics.setProperty(
      SchedulerForwarderMetrics.TimerQueueDelaySeconds,
      delaySeconds
    );

    await sqsClient.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(event.timerRequest),
        QueueUrl: timerQueueUrl,
        DelaySeconds: delaySeconds,
      })
    );

    if (event.clearSchedule) {
      console.debug("Deleting the schedule: " + event.scheduleName);
      await schedulerClient.send(
        new DeleteScheduleCommand({
          Name: event.scheduleName,
          GroupName: schedulerGroupName,
        })
      );
    }
  }
);
