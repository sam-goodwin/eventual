import {
  ExecutionStatus,
  HistoryStateEvent,
  CompleteExecution,
  FailedExecution,
  Execution,
  SleepScheduled,
  isSleepUntilCommand,
  WorkflowEventType,
  ActivityScheduled,
  SleepCompleted,
  WorkflowClient,
  TimerClient,
} from "@eventual/core";

import eventual from "@eventual/core";

import { KVNamespace, R2Bucket, R2ObjectBody } from "@cloudflare/workers-types";

export interface AWSWorkflowRuntimeClientProps {
  readonly lambda: LambdaClient;
  readonly activityWorkerFunctionName: string;
  readonly kv: KVNamespace;
  readonly executionHistoryBucket: R2Bucket;
  readonly tableName: string;
  readonly workflowClient: WorkflowClient;
  readonly timerClient: TimerClient;
}

export class AWSWorkflowRuntimeClient
  implements eventual.WorkflowRuntimeClient
{
  constructor(private props: AWSWorkflowRuntimeClientProps) {}

  async getHistory(executionId: string) {
    try {
      // get current history from s3
      const historyObject = await this.props.executionHistoryBucket.get(
        formatExecutionHistoryKey(executionId)
      );
      if (historyObject) {
        return historyEntryToEvents(historyObject);
      } else {
        return [];
      }
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
  }: eventual.UpdateHistoryRequest): Promise<{ bytes: number }> {
    const content = events.map((e) => JSON.stringify(e)).join("\n");

    await this.props.executionHistoryBucket.put(
      formatExecutionHistoryKey(executionId),
      content
    );

    return { bytes: content.length };
  }

  async completeExecution({
    executionId,
    result,
  }: eventual.CompleteExecutionRequest): Promise<CompleteExecution> {
    const executionSer = await this.props.kv.get(executionId);
    if (executionSer === null) {
      throw new Error(`execution does not exist: ${executionId}`);
    }
    const execution: Execution = JSON.parse(executionSer);

    const complete: CompleteExecution = {
      ...execution,
      endTime: new Date().toISOString(),
      result,
      status: ExecutionStatus.COMPLETE,
    };

    if (execution.status === ExecutionStatus.IN_PROGRESS) {
      await this.props.kv.put(executionId, JSON.stringify(complete));
    } else {
      console.warn(
        `skipping update of execution '${executionId}' because it has already closed`
      );
    }

    if (execution.parentExecutionId) {
      await this.reportCompletionToParent(
        execution.parentExecutionId,
        execution.seq!,
        result
      );
    }

    return complete;
  }

  async failExecution({
    executionId,
    error,
    message,
  }: eventual.FailExecutionRequest): Promise<FailedExecution> {
    const executionSer = await this.props.kv.get(executionId);
    if (executionSer === null) {
      throw new Error(`execution does not exist: ${executionId}`);
    }
    const execution: Execution = JSON.parse(executionSer);

    const failed: FailedExecution = {
      ...execution,
      endTime: new Date().toISOString(),
      status: ExecutionStatus.FAILED,
      error,
      message,
    };

    if (execution.status === ExecutionStatus.FAILED) {
      await this.props.kv.put(executionId, JSON.stringify(failed));
    } else {
      console.warn(
        `skipping update of execution '${executionId}' because it has already closed`
      );
    }

    if (execution.parentExecutionId) {
      await this.reportCompletionToParent(
        execution.parentExecutionId,
        execution.seq!,
        error,
        message
      );
    }

    if (failed.parentExecutionId) {
      await this.reportCompletionToParent(
        failed.parentExecutionId,
        failed.seq!,
        error,
        message
      );
    }

    return failed;
  }

  private async reportCompletionToParent(
    parentExecutionId: string,
    seq: number,
    ...args: [result: any] | [error: string, message: string]
  ) {
    await this.props.workflowClient.submitWorkflowTask(parentExecutionId, {
      seq,
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

  async scheduleActivity({
    workflowName,
    executionId,
    command,
  }: eventual.ScheduleActivityRequest) {
    const request: ActivityWorkerRequest = {
      scheduledTime: new Date().toISOString(),
      workflowName,
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

  async scheduleSleep({
    executionId,
    command,
    baseTime,
  }: eventual.ScheduleSleepRequest): Promise<SleepScheduled> {
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
      type: TimerRequestType.ForwardEvent,
      event: sleepCompletedEvent,
      untilTime: untilTimeIso,
      executionId,
    });

    return createEvent<SleepScheduled>({
      type: WorkflowEventType.SleepScheduled,
      seq: command.seq,
      untilTime: untilTime.toISOString(),
    });
  }
}

async function historyEntryToEvents(
  objectOutput: R2ObjectBody
): Promise<HistoryStateEvent[]> {
  if (objectOutput.body) {
    return (await objectOutput.text())
      .split("\n")
      .map((l) => JSON.parse(l)) as HistoryStateEvent[];
  }
  return [];
}

function formatExecutionHistoryKey(executionId: string) {
  return `executionHistory/${executionId}`;
}
