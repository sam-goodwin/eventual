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
} from "@eventual/core";
import {
  createExecutionFromResult,
  ExecutionRecord,
  SQSWorkflowTaskMessage,
} from "./workflow-client.js";
import { ActivityWorkerRequest } from "../activity.js";
import { createEvent } from "./execution-history-client.js";

export interface WorkflowRuntimeClientProps {
  readonly lambda: LambdaClient;
  readonly activityWorkerFunctionName: string;
  readonly dynamo: DynamoDBClient;
  readonly s3: S3Client;
  readonly executionHistoryBucket: string;
  readonly tableName: string;
  readonly scheduler: SchedulerClient;
  readonly schedulerRoleArn: string;
  readonly workflowQueueArn: string;
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
    const untilTime = isSleepUntilCommand(command)
      ? command.untilTime
      : new Date(
          baseTime.getTime() + command.durationSeconds * 1000
        ).toISOString();

    const workflowEvent: SQSWorkflowTaskMessage = {
      task: {
        events: [
          {
            type: WorkflowEventType.SleepCompleted,
            seq: command.seq,
            timestamp: untilTime,
          },
        ],
        executionId,
      },
    };

    await this.props.scheduler.send(
      new CreateScheduleCommand({
        FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF },
        ScheduleExpression: `at(${untilTime})`,
        Name: `${executionId}_sleep_${command.seq}`,
        // TODO: DQL and retry
        Target: {
          Arn: this.props.workflowQueueArn,
          RoleArn: this.props.schedulerRoleArn,
          Input: JSON.stringify(workflowEvent),
          SqsParameters: { MessageGroupId: executionId },
        },
      })
    );

    return createEvent<SleepScheduled>({
      type: WorkflowEventType.SleepScheduled,
      seq: command.seq,
      untilTime,
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
