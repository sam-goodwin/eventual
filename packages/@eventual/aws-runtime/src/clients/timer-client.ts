import {
  ConflictException,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  FlexibleTimeWindowMode,
  ResourceNotFoundException,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { getEventId, isTimeSchedule, Schedule } from "@eventual/core";
import {
  computeDurationSeconds,
  computeScheduleDate,
  getLazy,
  isActivityHeartbeatMonitorRequest,
  isTimerScheduleEventRequest,
  LazyValue,
  ScheduleForwarderRequest,
  TimerClient,
  TimerRequest,
} from "@eventual/core-runtime";
import { assertNever } from "@eventual/core/internal";
import { ulid } from "ulidx";

export interface AWSTimerClientProps {
  readonly scheduler: SchedulerClient;
  readonly schedulerRoleArn: LazyValue<string>;
  readonly schedulerDlqArn: LazyValue<string>;
  readonly schedulerGroup: LazyValue<string>;
  /**
   * If a timer has a longer duration (in seconds) than this threshold,
   * create an Event Bus Scheduler before sending it to the TimerQueue
   */
  readonly timerQueueThresholdSeconds: number;
  readonly timerQueueUrl: LazyValue<string>;
  readonly sqs: SQSClient;
  readonly scheduleForwarderArn: LazyValue<string>;
}

export class AWSTimerClient extends TimerClient {
  constructor(private props: AWSTimerClientProps) {
    super(() => new Date());
  }

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
  public async startShortTimer(timerRequest: TimerRequest) {
    const delaySeconds = computeTimerSeconds(
      timerRequest.schedule,
      this.baseTime()
    );

    if (delaySeconds > 15 * 60) {
      throw new Error(
        "TimerClient.startShortTimer only supports 15 minute timers or less. Use TimerClient.startTimer"
      );
    }

    await this.props.sqs.send(
      new SendMessageCommand({
        QueueUrl: getLazy(this.props.timerQueueUrl),
        MessageBody: JSON.stringify(timerRequest),
        DelaySeconds: delaySeconds,
      })
    );

    return delaySeconds;
  }

  /**
   * Starts a timer of any (positive) length.
   *
   * If the timer is longer than 15 minutes (configurable via `props.timerQueueThresholdMillis`),
   * the timer will create a  EventBridge schedule until the untilTime - props.timerQueueThresholdMillis
   * when the timer will be moved to the SQS queue.
   *
   * The SQS Queue will delay for floor(untilTime - currentTime) seconds until the timer handler can pick up the message.
   *
   * Finally the timer handler waits the remaining (untilTime - currentTime) milliseconds if necessary and then sends
   * the {@link TimerRequest} provided.
   */
  public async startTimer(timerRequest: TimerRequest) {
    const untilTime = computeScheduleDate(
      timerRequest.schedule,
      this.baseTime()
    );
    const timerDuration = computeTimerSeconds(
      timerRequest.schedule,
      this.baseTime()
    );

    /**
     * If the timer is longer than 15 minutes, create an EventBridge schedule first.
     * The Schedule will trigger a lambda which will re-compute the delay time and
     * create a message in the timerQueue.
     *
     * The timerQueue ultimately will pick up the event and forward the {@link TimerComplete} to the workflow queue.
     */
    if (timerDuration > this.props.timerQueueThresholdSeconds) {
      // wait for utilTime - timerQueueThresholdMillis and then forward the event to
      // the timerQueue
      const scheduleTime =
        untilTime.getTime() - this.props.timerQueueThresholdSeconds;
      // EventBridge Scheduler only supports HH:MM:SS, strip off the milliseconds and `Z`.
      const formattedSchedulerTime = new Date(scheduleTime)
        .toISOString()
        .split(".")[0];

      const scheduleName = getScheduleName(timerRequest);

      const schedulerForwardEvent: ScheduleForwarderRequest = {
        clearSchedule: true,
        scheduleName,
        timerRequest,
        forwardTime: "<aws.scheduler.scheduled-time>",
        untilTime: untilTime.toISOString(),
      };

      try {
        await this.props.scheduler.send(
          new CreateScheduleCommand({
            GroupName: getLazy(this.props.schedulerGroup),
            FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF },
            ScheduleExpression: `at(${formattedSchedulerTime})`,
            Name: scheduleName,
            Target: {
              Arn: getLazy(this.props.scheduleForwarderArn),
              RoleArn: getLazy(this.props.schedulerRoleArn),
              Input: JSON.stringify(schedulerForwardEvent),
              RetryPolicy: {
                // send to the DLQ if 14 minutes have passed without forwarding the event.
                MaximumEventAgeInSeconds: 14 * 60,
              },
              DeadLetterConfig: {
                // TODO: handle messages in the DLQ - https://github.com/functionless/eventual/issues/39
                Arn: getLazy(this.props.schedulerDlqArn),
              },
            },
          })
        );
      } catch (err) {
        // if the schedule already exists, assume it because we created it already.
        if (!(err instanceof ConflictException)) {
          throw err;
        }
      }
    } else {
      /**
       * When the timer is less than 15 minutes, send the timer directly to the
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
   * the timer is transferred from EventBridge to SQS at `props.timerQueueThresholdMillis`.
   */
  public async clearSchedule(scheduleName: string) {
    try {
      await this.props.scheduler.send(
        new DeleteScheduleCommand({
          Name: scheduleName,
          GroupName: getLazy(this.props.schedulerGroup),
          // the docs say optional, but an error is thrown when not present.
          ClientToken: scheduleName,
        })
      );
    } catch (err) {
      // if resource is already deleted, ignore
      if (!(err instanceof ResourceNotFoundException)) {
        throw err;
      }
    }
  }
}

/**
 * Get the schedule name from the request and filter out any invalid characters.
 *
 * ^[0-9a-zA-Z-_.]+$
 *
 * https://docs.aws.amazon.com/scheduler/latest/APIReference/API_CreateSchedule.html#API_CreateSchedule_RequestSyntax
 */
function getScheduleName(timerRequest: TimerRequest) {
  if (isTimerScheduleEventRequest(timerRequest)) {
    return safeScheduleName(
      `${timerRequest.executionId}_${getEventId(timerRequest.event)}`
    );
  } else if (isActivityHeartbeatMonitorRequest(timerRequest)) {
    // heart beat timers will always be unique. We maybe create any number of them.
    return safeScheduleName(`heartbeat_${timerRequest.executionId}_${ulid()}`);
  }
  return assertNever(timerRequest);
}

function safeScheduleName(name: string) {
  return name.replaceAll(/[^0-9a-zA-Z-_.]/g, "");
}

function computeTimerSeconds(schedule: Schedule, baseTime: Date) {
  return isTimeSchedule(schedule)
    ? Math.max(
        // Compute the number of seconds (floored)
        // subtract 1 because the maxBatchWindow is set to 1s on the lambda event source.
        // this allows for more events to be sent at once while not adding extra latency
        Math.ceil(
          (new Date(schedule.isoDate).getTime() - baseTime.getTime()) / 1000
        ),
        0
      )
    : computeDurationSeconds(schedule);
}
