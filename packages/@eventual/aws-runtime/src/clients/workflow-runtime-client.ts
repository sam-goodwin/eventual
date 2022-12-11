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
  ActivityWorkerRequest,
  CompleteExecution,
  CompleteExecutionRequest,
  ExecutionStatus,
  FailedExecution,
  FailExecutionRequest,
  HistoryStateEvent,
  UpdateHistoryRequest,
  WorkflowEventType,
  WorkflowRuntimeClient,
} from "@eventual/core";
import { AWSTimerClient } from "./timer-client.js";
import {
  AWSWorkflowClient,
  createExecutionFromResult,
  ExecutionRecord,
} from "./workflow-client.js";

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

  public async getHistory(executionId: string): Promise<HistoryStateEvent[]> {
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

  public async completeExecution({
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

  public async failExecution({
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

  public async startActivity(request: ActivityWorkerRequest): Promise<void> {
    await this.props.lambda.send(
      new InvokeCommand({
        FunctionName: this.props.activityWorkerFunctionName,
        Payload: Buffer.from(JSON.stringify(request)),
        InvocationType: InvocationType.Event,
      })
    );
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
