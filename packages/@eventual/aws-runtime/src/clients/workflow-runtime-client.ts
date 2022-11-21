import {
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  GetObjectCommand,
  GetObjectCommandOutput,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  LambdaClient,
  InvokeCommand,
  InvocationType,
} from "@aws-sdk/client-lambda";
import {
  CreateScheduleCommand,
  FlexibleTimeWindowMode,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import {
  ExecutionStatus,
  HistoryStateEvent,
  CompleteExecution,
  FailedExecution,
  Execution,
  SleepUntilCommand,
  SleepForCommand,
  SleepScheduled,
  isSleepUntilCommand,
  WorkflowEventType,
  StartActivityCommand,
  ActivityScheduled,
  SleepCompleted,
} from "@eventual/core";
import {
  createExecutionFromResult,
  ExecutionRecord,
} from "./workflow-client.js";
import { ActivityWorkerRequest } from "../activity.js";
import { createEvent } from "./execution-history-client.js";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  TimerForwardEventRequest,
  TimerRequestType,
} from "src/handlers/timer-handler.js";
import { ScheduleForwarderRequest } from "src/handlers/schedule-forwarder.js";

export interface WorkflowRuntimeClientProps {
  readonly lambda: LambdaClient;
  readonly activityWorkerFunctionName: string;
  readonly dynamo: DynamoDBClient;
  readonly s3: S3Client;
  readonly executionHistoryBucket: string;
  readonly tableName: string;
  readonly workflowQueueArn: string;
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

export class WorkflowRuntimeClient {
  constructor(private props: WorkflowRuntimeClientProps) {}

  async getHistory(executionId: string) {
    try {
      // get current history from s3
      const historyObject = await this.props.s3.send(
        new GetObjectCommand({
          Key: formatExecutionHistoryKey(executionId),
          Bucket: this.props.executionHistoryBucket,
        })
      );

      return await historyEntryToEvents(historyObject);
    } catch (err) {
      if (err instanceof NoSuchKey) {
        return [];
      }
      throw err;
    }
  }

  // TODO: etag
  async updateHistory(
    executionId: string,
    events: HistoryStateEvent[]
  ): Promise<{ bytes: number }> {
    const content = events.map((e) => JSON.stringify(e)).join("\n");
    // get current history from s3
    await this.props.s3.send(
      new PutObjectCommand({
        Key: formatExecutionHistoryKey(executionId),
        Bucket: this.props.executionHistoryBucket,
        Body: content,
      })
    );
    return { bytes: content.length };
  }

  async completeExecution(
    executionId: string,
    result?: any
  ): Promise<CompleteExecution> {
    const executionResult = await this.props.dynamo.send(
      new UpdateItemCommand({
        Key: {
          pk: { S: ExecutionRecord.PRIMARY_KEY },
          sk: { S: ExecutionRecord.sortKey(executionId) },
        },
        TableName: this.props.tableName,
        UpdateExpression: result
          ? "SET #status=:complete, #result=:result, endTime=:endTime"
          : "SET #status=:complete, endTime=:endTime",
        ConditionExpression: "#status=:in_progress",
        ExpressionAttributeNames: {
          "#status": "status",
          ...(result ? { "#result": "result" } : {}),
        },
        ExpressionAttributeValues: {
          ":complete": { S: ExecutionStatus.COMPLETE },
          ":in_progress": { S: ExecutionStatus.IN_PROGRESS },
          ":endTime": { S: new Date().toISOString() },
          ...(result ? { ":result": { S: JSON.stringify(result) } } : {}),
        },
        ReturnValues: "ALL_NEW",
      })
    );

    return createExecutionFromResult(
      executionResult.Attributes as unknown as ExecutionRecord
    ) as CompleteExecution;
  }

  async failExecution(
    executionId: string,
    error: string,
    message: string
  ): Promise<FailedExecution> {
    const executionResult = await this.props.dynamo.send(
      new UpdateItemCommand({
        Key: {
          pk: { S: ExecutionRecord.PRIMARY_KEY },
          sk: { S: ExecutionRecord.sortKey(executionId) },
        },
        TableName: this.props.tableName,
        UpdateExpression:
          "SET #status=:failed, #error=:error, #message=:message, endTime=:endTime",
        ConditionExpression: "#status=:in_progress",
        ExpressionAttributeNames: {
          "#status": "status",
          "#error": "error",
          "#message": "message",
        },
        ExpressionAttributeValues: {
          ":failed": { S: ExecutionStatus.FAILED },
          ":in_progress": { S: ExecutionStatus.IN_PROGRESS },
          ":endTime": { S: new Date().toISOString() },
          ":error": { S: error },
          ":message": { S: message },
        },
        ReturnValues: "ALL_NEW",
      })
    );

    return createExecutionFromResult(
      executionResult.Attributes as unknown as ExecutionRecord
    ) as FailedExecution;
  }

  async getExecutions(): Promise<Execution[]> {
    const executions = await this.props.dynamo.send(
      new QueryCommand({
        TableName: this.props.tableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": { S: ExecutionRecord.PRIMARY_KEY },
        },
      })
    );
    return executions.Items!.map((execution) =>
      createExecutionFromResult(execution as ExecutionRecord)
    );
  }

  async scheduleActivity(executionId: string, command: StartActivityCommand) {
    const request: ActivityWorkerRequest = {
      scheduledTime: new Date().toISOString(),
      executionId,
      command,
      retry: 0,
    };

    await this.props.lambda.send(
      new InvokeCommand({
        FunctionName: this.props.activityWorkerFunctionName,
        Payload: Buffer.from(JSON.stringify(request)),
        InvocationType: InvocationType.Event,
      })
    );

    return createEvent<ActivityScheduled>({
      type: WorkflowEventType.ActivityScheduled,
      seq: command.seq,
      name: command.name,
    });
  }

  async scheduleSleep(
    executionId: string,
    command: SleepUntilCommand | SleepForCommand,
    baseTime: Date
  ): Promise<SleepScheduled> {
    // TODO validate
    const untilTime = isSleepUntilCommand(command)
      ? new Date(command.untilTime)
      : new Date(baseTime.getTime() + command.durationSeconds * 1000);
    const untilTimeIso = untilTime.toISOString();

    const sleepDuration = untilTime.getTime() - baseTime.getTime();

    const sleepCompletedEvent: SleepCompleted = {
      type: WorkflowEventType.SleepCompleted,
      seq: command.seq,
      timestamp: untilTimeIso,
    };

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

      const schedulerForwardEvent: ScheduleForwarderRequest = {
        clearSchedule: true,
        scheduleName: "<aws.scheduler.schedule-arn>",
        timerRequest: {
          type: TimerRequestType.ForwardEvent,
          event: sleepCompletedEvent,
          executionId,
          untilTime: untilTimeIso,
        },
        forwardTime: "<aws.scheduler.scheduled-time>",
        untilTime: untilTimeIso,
      };

      await this.props.scheduler.send(
        new CreateScheduleCommand({
          FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF },
          ScheduleExpression: `at(${formattedSchedulerTime})`,
          Name: `${executionId}_sleep_${command.seq}`,
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
      const timerRequest: TimerForwardEventRequest = {
        type: TimerRequestType.ForwardEvent,
        event: sleepCompletedEvent,
        executionId,
        untilTime: untilTimeIso,
      };

      await this.props.sqs.send(
        new SendMessageCommand({
          QueueUrl: this.props.timerQueueUrl,
          MessageBody: JSON.stringify(timerRequest),
          DelaySeconds: sleepDuration,
        })
      );
    }

    return createEvent<SleepScheduled>({
      type: WorkflowEventType.SleepScheduled,
      seq: command.seq,
      untilTime: untilTime.toISOString(),
    });
  }
}

async function historyEntryToEvents(
  objectOutput: GetObjectCommandOutput
): Promise<HistoryStateEvent[]> {
  if (objectOutput.Body) {
    return (await objectOutput.Body.transformToString())
      .split("\n")
      .map((l) => JSON.parse(l)) as HistoryStateEvent[];
  }
  return [];
}

function formatExecutionHistoryKey(executionId: string) {
  return `executionHistory/${executionId}`;
}
