import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import {
  tableName,
  workflowQueueUrl,
  activityLockTableName,
  actionWorkerFunctionName,
  executionHistoryBucket,
} from "../env";
import { ActivityRuntimeClient } from "./activity-runtime-client";
import { ExecutionHistoryClient } from "./execution-history-client";
import { WorkflowClient } from "./workflow-client";
import { WorkflowRuntimeClient } from "./workflow-runtime-client";

const dynamo = new DynamoDBClient({});
const sqs = new SQSClient({});
const s3 = new S3Client({ region: process.env.AWS_REGION });
const lambda = new LambdaClient({});

export const createExecutionHistoryClient = () =>
  new ExecutionHistoryClient({
    dynamo,
    tableName: tableName(),
  });

export const createWorkflowClient = (
  executionHistoryClient: ExecutionHistoryClient = createExecutionHistoryClient()
) =>
  new WorkflowClient({
    sqs,
    workflowQueueUrl: workflowQueueUrl(),
    executionHistory: executionHistoryClient,
    dynamo,
    tableName: tableName(),
  });

export const createActivityRuntimeClient = () =>
  new ActivityRuntimeClient({
    activityLockTableName: activityLockTableName(),
    dynamo: dynamo,
  });

export const createWorkflowRuntimeClient = () =>
  new WorkflowRuntimeClient({
    dynamo,
    s3,
    // todo fail when missing
    executionHistoryBucket: executionHistoryBucket(),
    tableName: tableName(),
    lambda: lambda,
    actionWorkerFunctionName: actionWorkerFunctionName(),
  });
