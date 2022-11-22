import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  FlexibleTimeWindowMode,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { assertNever, getEventId } from "@eventual/core";
import {
  isTimerForwardEventRequest,
  ScheduleForwarderRequest,
  TimerRequest,
} from "../handlers/types.js";

export interface TimerClientProps {
  readonly scheduler: SchedulerClient;
  readonly schedulerRoleArn: string;
  readonly schedulerDlqArn: string;
  readonly schedulerGroup: string;
  /**
   * If a sleep has a longer duration (in millis) than this threshold,
   * create an Event Bus Scheduler before sending it to the TimerQueue
   */
  readonly sleepQueueThresholdMillis: number;
  readonly timerQueueUrl: string;
  readonly sqs: SQSClient;
  readonly scheduleForwarderArn: string;
}

export class TimerClient {
  constructor(private props: TimerClientProps) {}

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
  async startShortTimer(timerRequest: TimerRequest) {
    const delaySeconds = Math.floor(
      (new Date(timerRequest.untilTime).getTime() - new Date().getTime()) / 1000
    );

    if (delaySeconds > 15 * 60) {
      throw new Error(
        "TimerClient.startShortTimer only supports 15 minute timers or less. Use TimerClient.startTimer"
      );
    }

    await this.props.sqs.send(
      new SendMessageCommand({
        QueueUrl: this.props.timerQueueUrl,
        MessageBody: JSON.stringify(timerRequest),
        DelaySeconds: delaySeconds,
      })
    );

    return delaySeconds;
  }

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
  async startTimer(timerRequest: TimerRequest) {
    const untilTime = new Date(timerRequest.untilTime);
    const untilTimeIso = untilTime.toISOString();

    const sleepDuration = untilTime.getTime() - new Date().getTime();

    /**
     * If the sleep is longer than 15 minutes, create an EventBridge schedule first.
     * The Schedule will trigger a lambda which will re-compute the delay time and
     * create a message in the timerQueue.
     *
     * The timerQueue ultimately will puck up the event and forward the {@link SleepComplete} to the workflow queue.
     */
    if (sleepDuration > this.props.sleepQueueThresholdMillis) {
      // wait for utilTime - sleepQueueThresholdMillis and then forward the event to
      // the timerQueue
      const scheduleTime =
        untilTime.getTime() - this.props.sleepQueueThresholdMillis;
      const formattedSchedulerTime = new Date(scheduleTime)
        .toISOString()
        .split(".")[0];

      const scheduleName = getScheduleName(timerRequest);

      const schedulerForwardEvent: ScheduleForwarderRequest = {
        clearSchedule: true,
        scheduleName: scheduleName,
        timerRequest,
        forwardTime: "<aws.scheduler.scheduled-time>",
        untilTime: untilTimeIso,
      };

      await this.props.scheduler.send(
        new CreateScheduleCommand({
          FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF },
          ScheduleExpression: `at(${formattedSchedulerTime})`,
          Name: scheduleName,
          Target: {
            Arn: this.props.scheduleForwarderArn,
            RoleArn: this.props.schedulerRoleArn,
            Input: JSON.stringify(schedulerForwardEvent),
            RetryPolicy: {
              // send to the DLQ if 15 minutes have passed without forwarding the event.
              MaximumEventAgeInSeconds: 14 * 60,
            },
            DeadLetterConfig: {
              // TODO: do something with these.
              Arn: this.props.schedulerDlqArn,
            },
          },
          GroupName: this.props.schedulerGroup,
        })
      );
    } else {
      /**
       * When the sleep is less than 15 minutes, send the timer directly to the
       * timer queue. The timer queue will pass the event on to the workflow queue
       * once delaySeconds have passed.
       */
      await this.startShortTimer(timerRequest);
    }
  }

  /**
   * When startTimer is used, the EventBridge schedule will not self delete.
   *
   * Use this method to clean the schedule.
   *
   * The provided schedule-forwarder function will call this method in Eventual when
   * the timer is transferred from EventBridge to SQS at `props.sleepQueueThresholdMillis`.
   */
  async clearSchedule(scheduleName: string) {
    await this.props.scheduler.send(
      new DeleteScheduleCommand({
        Name: scheduleName,
        GroupName: this.props.schedulerGroup,
        // the docs say optional, but an error is thrown when not present.
        ClientToken: scheduleName,
      })
    );
  }
}

function getScheduleName(timerRequest: TimerRequest) {
  if (isTimerForwardEventRequest(timerRequest)) {
    return `${timerRequest.executionId}_${getEventId(timerRequest.event)}`;
  }
  return assertNever(timerRequest);
}
