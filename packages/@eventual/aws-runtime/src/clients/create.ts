import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import * as env from "../env";
import { ActivityRuntimeClient } from "./activity-runtime-client";
import { ExecutionHistoryClient } from "./execution-history-client";
import { WorkflowClient } from "./workflow-client";
import { WorkflowRuntimeClient } from "./workflow-runtime-client";
import memoize from "micro-memoize";
import { deepEqual } from "fast-equals";
import { SchedulerClient } from "@aws-sdk/client-scheduler";

/**
 * Client creators to be used by the lambda functions.
 *
 * Any used clients should be tree shaken by esbuild.
 * The pure annotations help esbuild determine that theses functions calls have no side effects.
 */

const dynamo = /*@__PURE__*/ memoize(() => new DynamoDBClient({}));
export const sqs = /*@__PURE__*/ memoize(() => new SQSClient({}));
const s3 = /*@__PURE__*/ memoize(
  () => new S3Client({ region: process.env.AWS_REGION })
);
const lambda = /*@__PURE__*/ memoize(() => new LambdaClient({}));
export const scheduler = /*@__PURE__*/ memoize(() => new SchedulerClient({}));

export const createExecutionHistoryClient = /*@__PURE__*/ memoize(
  ({ tableName }: { tableName?: string } = {}) =>
    new ExecutionHistoryClient({
      dynamo: dynamo(),
      tableName: tableName ?? env.tableName(),
    }),
  { isEqual: deepEqual }
);

export const createWorkflowClient = /*@__PURE__*/ memoize(
  ({
    tableName,
    workflowQueueUrl,
  }: {
    tableName?: string;
    workflowQueueUrl?: string;
  } = {}) =>
    new WorkflowClient({
      sqs: sqs(),
      workflowQueueUrl: workflowQueueUrl ?? env.workflowQueueUrl(),
      executionHistory: createExecutionHistoryClient({ tableName }),
      dynamo: dynamo(),
      tableName: tableName ?? env.tableName(),
    }),
  { isEqual: deepEqual }
);

export const createActivityRuntimeClient = /*@__PURE__*/ memoize(
  () =>
    new ActivityRuntimeClient({
      activityLockTableName: env.activityLockTableName(),
      dynamo: dynamo(),
    })
);

export const createWorkflowRuntimeClient = /*@__PURE__*/ memoize(
  ({
    tableName,
    executionHistoryBucket,
    activityWorkerFunctionName,
  }: {
    tableName?: string;
    executionHistoryBucket?: string;
    activityWorkerFunctionName?: string;
  } = {}) =>
    new WorkflowRuntimeClient({
      dynamo: dynamo(),
      s3: s3(),
      // todo fail when missing
      executionHistoryBucket:
        executionHistoryBucket ?? env.executionHistoryBucket(),
      tableName: tableName ?? env.tableName(),
      lambda: lambda(),
      activityWorkerFunctionName:
        activityWorkerFunctionName ?? env.activityWorkerFunctionName(),
      scheduler: scheduler(),
      workflowQueueArn: env.workflowQueueArn(),
      schedulerRoleArn: env.schedulerRoleArn(),
      schedulerDlqArn: env.schedulerDlqArn(),
      schedulerGroup: env.schedulerGroup(),
      sleepQueueThresholdMillis: 15 * 60 * 1000,
      sqs: sqs(),
      timerQueueUrl: env.timerQueueUrl(),
      scheduleForwarderArn: env.schedulerForwarderArn(),
    })
);
