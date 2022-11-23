import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
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
  ExecutionStatus,
  HistoryStateEvents,
  CompleteExecution,
  FailedExecution,
  Execution,
  ScheduleActivityCommand,
  WorkflowEventType,
} from "@eventual/core";
import {
  createExecutionFromResult,
  ExecutionRecord,
  SQSWorkflowTaskMessage,
} from "./workflow-client.js";
import { ActivityWorkerRequest } from "../activity.js";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

import LRUCache from "lru-cache";

export interface WorkflowRuntimeClientProps {
  readonly lambda: LambdaClient;
  readonly activityWorkerFunctionName: string;
  readonly dynamo: DynamoDBClient;
  readonly s3: S3Client;
  readonly sqs: SQSClient;
  readonly executionHistoryBucket: string;
  readonly tableName: string;
  readonly workflowQueueUrl: string;
}

export interface CompleteExecutionRequest {
  executionId: string;
  result?: any;
}

export class WorkflowRuntimeClient {
  private workflowNameCache = new LRUCache<string, string>({
    max: 1000,
  });

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

  async getWorkflowName(executionId: string): Promise<string | undefined> {
    let workflowName = this.workflowNameCache.get(executionId);
    if (workflowName !== undefined) {
      return workflowName;
    }
    const response = await this.props.dynamo.send(
      new GetItemCommand({
        TableName: this.props.tableName,
        Key: {
          pk: { S: ExecutionRecord.PRIMARY_KEY },
          sk: { S: ExecutionRecord.sortKey(executionId) },
        },
        AttributesToGet: ["workflowName"],
      })
    );
    if (response.Item === undefined) {
      return undefined;
    }
    workflowName = response.Item.workflowName?.S;
    if (workflowName) {
      this.workflowNameCache.set(executionId, workflowName);
    }
    return workflowName;
  }

  // TODO: etag
  async updateHistory(
    executionId: string,
    events: HistoryStateEvents[]
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

    const record = executionResult.Attributes as unknown as ExecutionRecord;
    if (record.parentExecutionId) {
      await this.completeChildExecution(
        executionId,
        record.parentExecutionId,
        record.seq,
        result
      );
    }

    return createExecutionFromResult(record) as CompleteExecution;
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

    const record = executionResult.Attributes as unknown as ExecutionRecord;
    if (record.parentExecutionId) {
      await this.completeChildExecution(
        executionId,
        record.parentExecutionId,
        record.seq,
        error,
        message
      );
    }

    return createExecutionFromResult(
      executionResult.Attributes as unknown as ExecutionRecord
    ) as FailedExecution;
  }

  private async completeChildExecution(
    executionId: string,
    parentExecutionId: AttributeValue.SMember,
    seq: AttributeValue.NMember,
    ...args: [result: any] | [error: string, message: string]
  ) {
    const workflowTask: SQSWorkflowTaskMessage = {
      task: {
        executionId: parentExecutionId.S,
        events: [
          {
            seq: parseInt(seq.N, 10),
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
          },
        ],
      },
    };
    await this.props.sqs.send(
      new SendMessageCommand({
        QueueUrl: this.props.workflowQueueUrl,
        MessageBody: JSON.stringify(workflowTask),
        MessageGroupId: parentExecutionId.S,
        MessageDeduplicationId: `${executionId}/complete`,
      })
    );
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

  async scheduleActivity(
    workflowName: string,
    executionId: string,
    command: ScheduleActivityCommand
  ) {
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
  }
}

async function historyEntryToEvents(
  objectOutput: GetObjectCommandOutput
): Promise<HistoryStateEvents[]> {
  if (objectOutput.Body) {
    return (await objectOutput.Body.transformToString())
      .split("\n")
      .map((l) => JSON.parse(l)) as HistoryStateEvents[];
  }
  return [];
}

function formatExecutionHistoryKey(executionId: string) {
  return `executionHistory/${executionId}`;
}
