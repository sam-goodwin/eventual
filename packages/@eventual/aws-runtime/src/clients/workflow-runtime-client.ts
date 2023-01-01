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
  SucceededExecution,
  SucceedExecutionRequest,
  ExecutionStatus,
  FailedExecution,
  FailExecutionRequest,
  HistoryStateEvent,
  isFailedExecutionRequest,
  TimerClient,
  UpdateHistoryRequest,
  WorkflowClient,
  WorkflowRuntimeClient,
} from "@eventual/core";
import {
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
  readonly workflowClient: WorkflowClient;
  readonly timerClient: TimerClient;
}

export class AWSWorkflowRuntimeClient extends WorkflowRuntimeClient {
  constructor(private props: AWSWorkflowRuntimeClientProps) {
    super(props.workflowClient);
  }

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
  public async updateHistory({
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

  protected async updateExecution(
    request: FailExecutionRequest | SucceedExecutionRequest
  ) {
    const executionResult = isFailedExecutionRequest(request)
      ? await this.props.dynamo.send(
          new UpdateItemCommand({
            Key: {
              pk: { S: ExecutionRecord.PARTITION_KEY },
              sk: { S: ExecutionRecord.sortKey(request.executionId) },
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
              ":error": { S: request.error },
              ":message": { S: request.message },
            },
            ReturnValues: "ALL_NEW",
          })
        )
      : await this.props.dynamo.send(
          new UpdateItemCommand({
            Key: {
              pk: { S: ExecutionRecord.PARTITION_KEY },
              sk: { S: ExecutionRecord.sortKey(request.executionId) },
            },
            TableName: this.props.tableName,
            UpdateExpression: request.result
              ? "SET #status=:complete, #result=:result, endTime=if_not_exists(endTime,:endTime)"
              : "SET #status=:complete, endTime=if_not_exists(endTime,:endTime)",
            ExpressionAttributeNames: {
              "#status": "status",
              ...(request.result ? { "#result": "result" } : {}),
            },
            ExpressionAttributeValues: {
              ":complete": { S: ExecutionStatus.SUCCEEDED },
              ":endTime": { S: new Date().toISOString() },
              ...(request.result
                ? { ":result": { S: JSON.stringify(request.result) } }
                : {}),
            },
            ReturnValues: "ALL_NEW",
          })
        );

    return createExecutionFromResult(
      executionResult.Attributes as ExecutionRecord
    ) as SucceededExecution | FailedExecution;
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
