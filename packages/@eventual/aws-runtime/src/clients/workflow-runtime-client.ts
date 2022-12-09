import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import {
  InvocationType,
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import {
  GetObjectCommand,
  GetObjectCommandOutput,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  ActivityScheduled,
  ActivityWorkerRequest,
  CompleteExecution,
  CompleteExecutionRequest,
  createEvent,
  ExecuteExpectSignalRequest,
  ExecutionStatus,
  ExpectSignalStarted,
  ExpectSignalTimedOut,
  FailedExecution,
  FailExecutionRequest,
  HistoryStateEvent,
  isSleepUntilCommand,
  ScheduleActivityRequest,
  ScheduleSleepRequest,
  SleepCompleted,
  ActivityTimedOut,
  ChildWorkflowScheduled,
  TimerRequestType,
  SleepScheduled,
  UpdateHistoryRequest,
  WorkflowEventType,
  WorkflowRuntimeClient,
  ScheduleWorkflowRequest,
} from "@eventual/core";
import { AWSTimerClient } from "./timer-client.js";
import {
  AWSWorkflowClient,
  createExecutionFromResult,
  ExecutionRecord,
} from "./workflow-client.js";
import { formatChildExecutionName } from "../utils.js";

export interface AWSWorkflowRuntimeClientProps {
  readonly lambda: LambdaClient;
  readonly activityWorkerFunctionName: string;
  readonly dynamo: DynamoDBClient;
  readonly s3: S3Client;
  readonly executionHistoryBucket: string;
  readonly tableName: string;
  readonly workflowClient: AWSWorkflowClient;
  readonly timerClient: AWSTimerClient;
}

export class AWSWorkflowRuntimeClient implements WorkflowRuntimeClient {
  constructor(private props: AWSWorkflowRuntimeClientProps) {}

  async getHistory(executionId: string): Promise<HistoryStateEvent[]> {
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
  async updateHistory({
    executionId,
    events,
  }: UpdateHistoryRequest): Promise<{ bytes: number }> {
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

  async completeExecution({
    executionId,
    result,
  }: CompleteExecutionRequest): Promise<CompleteExecution> {
    const executionResult = await this.props.dynamo.send(
      new UpdateItemCommand({
        Key: {
          pk: { S: ExecutionRecord.PRIMARY_KEY },
          sk: { S: ExecutionRecord.sortKey(executionId) },
        },
        TableName: this.props.tableName,
        UpdateExpression: result
          ? "SET #status=:complete, #result=:result, endTime=if_not_exists(endTime,:endTime)"
          : "SET #status=:complete, endTime=if_not_exists(endTime,:endTime)",
        ExpressionAttributeNames: {
          "#status": "status",
          ...(result ? { "#result": "result" } : {}),
        },
        ExpressionAttributeValues: {
          ":complete": { S: ExecutionStatus.COMPLETE },
          ":endTime": { S: new Date().toISOString() },
          ...(result ? { ":result": { S: JSON.stringify(result) } } : {}),
        },
        ReturnValues: "ALL_NEW",
      })
    );

    const record = executionResult.Attributes as unknown as ExecutionRecord;
    if (record.parentExecutionId) {
      await this.reportCompletionToParent(
        record.parentExecutionId.S,
        record.seq.N,
        result
      );
    }

    return createExecutionFromResult(record) as CompleteExecution;
  }

  async failExecution({
    executionId,
    error,
    message,
  }: FailExecutionRequest): Promise<FailedExecution> {
    const executionResult = await this.props.dynamo.send(
      new UpdateItemCommand({
        Key: {
          pk: { S: ExecutionRecord.PRIMARY_KEY },
          sk: { S: ExecutionRecord.sortKey(executionId) },
        },
        TableName: this.props.tableName,
        UpdateExpression:
          "SET #status=:failed, #error=:error, #message=:message, endTime=if_not_exists(endTime,:endTime)",
        ExpressionAttributeNames: {
          "#status": "status",
          "#error": "error",
          "#message": "message",
        },
        ExpressionAttributeValues: {
          ":failed": { S: ExecutionStatus.FAILED },
          ":endTime": { S: new Date().toISOString() },
          ":error": { S: error },
          ":message": { S: message },
        },
        ReturnValues: "ALL_NEW",
      })
    );

    const record = executionResult.Attributes as unknown as ExecutionRecord;
    if (record.parentExecutionId) {
      await this.reportCompletionToParent(
        record.parentExecutionId.S,
        record.seq.N,
        error,
        message
      );
    }

    return createExecutionFromResult(record) as FailedExecution;
  }

  private async reportCompletionToParent(
    parentExecutionId: string,
    seq: string,
    ...args: [result: any] | [error: string, message: string]
  ) {
    await this.props.workflowClient.submitWorkflowTask(parentExecutionId, {
      seq: parseInt(seq, 10),
      timestamp: new Date().toISOString(),
      ...(args.length === 1
        ? {
            type: WorkflowEventType.ChildWorkflowCompleted,
            result: args[0],
          }
        : {
            type: WorkflowEventType.ChildWorkflowFailed,
            error: args[0],
            message: args[1],
          }),
    });
  }

  async scheduleActivity({
    workflowName,
    executionId,
    command,
    baseTime,
  }: ScheduleActivityRequest) {
    const request: ActivityWorkerRequest = {
      scheduledTime: new Date().toISOString(),
      workflowName,
      executionId,
      command,
      retry: 0,
    };

    await Promise.allSettled([]);

    const timeoutStarter = command.timeoutSeconds
      ? await this.props.timerClient.scheduleEvent<ActivityTimedOut>({
          schedule: {
            baseTime,
            timerSeconds: command.timeoutSeconds,
          },
          event: {
            type: WorkflowEventType.ActivityTimedOut,
            seq: command.seq,
          },
          executionId,
        })
      : undefined;

    const heartbeatTimeoutStarter = command.heartbeatSeconds
      ? await this.props.timerClient.startTimer({
          type: TimerRequestType.ActivityHeartbeatMonitor,
          activitySeq: command.seq,
          executionId,
          heartbeatSeconds: command.heartbeatSeconds,
          schedule: {
            timerSeconds: command.heartbeatSeconds,
            baseTime,
          },
        })
      : undefined;

    const activityStarter = this.props.lambda.send(
      new InvokeCommand({
        FunctionName: this.props.activityWorkerFunctionName,
        Payload: Buffer.from(JSON.stringify(request)),
        InvocationType: InvocationType.Event,
      })
    );

    await Promise.all([
      activityStarter,
      timeoutStarter,
      heartbeatTimeoutStarter,
    ]);

    return createEvent<ActivityScheduled>({
      type: WorkflowEventType.ActivityScheduled,
      seq: command.seq,
      name: command.name,
    });
  }

  public async scheduleChildWorkflow({
    command,
    executionId,
  }: ScheduleWorkflowRequest): Promise<ChildWorkflowScheduled> {
    await this.props.workflowClient.startWorkflow({
      workflowName: command.name,
      input: command.input,
      parentExecutionId: executionId,
      executionName: formatChildExecutionName(executionId, command.seq),
      seq: command.seq,
    });

    return createEvent<ChildWorkflowScheduled>({
      type: WorkflowEventType.ChildWorkflowScheduled,
      seq: command.seq,
      name: command.name,
      input: command.input,
    });
  }

  async scheduleSleep({
    executionId,
    command,
    baseTime,
  }: ScheduleSleepRequest): Promise<SleepScheduled> {
    // TODO validate
    const untilTime = isSleepUntilCommand(command)
      ? new Date(command.untilTime)
      : new Date(baseTime.getTime() + command.durationSeconds * 1000);
    const untilTimeIso = untilTime.toISOString();

    const sleepCompletedEvent: SleepCompleted = {
      type: WorkflowEventType.SleepCompleted,
      seq: command.seq,
      timestamp: untilTimeIso,
    };

    await this.props.timerClient.startTimer({
      type: TimerRequestType.ScheduleEvent,
      event: sleepCompletedEvent,
      schedule: {
        untilTime: untilTimeIso,
      },
      executionId,
    });

    return createEvent<SleepScheduled>({
      type: WorkflowEventType.SleepScheduled,
      seq: command.seq,
      untilTime: untilTime.toISOString(),
    });
  }

  async executionExpectSignal({
    executionId,
    command,
    baseTime,
  }: ExecuteExpectSignalRequest): Promise<ExpectSignalStarted> {
    if (command.timeoutSeconds) {
      await this.props.timerClient.scheduleEvent<ExpectSignalTimedOut>({
        event: {
          signalId: command.signalId,
          seq: command.seq,
          type: WorkflowEventType.ExpectSignalTimedOut,
        },
        schedule: {
          timerSeconds: command.timeoutSeconds,
          baseTime,
        },
        executionId,
      });
    }

    return createEvent<ExpectSignalStarted>({
      signalId: command.signalId,
      seq: command.seq,
      type: WorkflowEventType.ExpectSignalStarted,
      timeoutSeconds: command.timeoutSeconds,
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
