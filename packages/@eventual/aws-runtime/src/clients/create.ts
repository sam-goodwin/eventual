import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import * as env from "../env";
import { AWSActivityRuntimeClient } from "./activity-runtime-client";
import { AWSExecutionHistoryClient } from "./execution-history-client";
import { AWSWorkflowClient } from "./workflow-client";
import { AWSWorkflowRuntimeClient } from "./workflow-runtime-client";
import memoize from "micro-memoize";
import { deepEqual } from "fast-equals";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { AWSTimerClient, AWSTimerClientProps } from "./timer-client";

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
    new AWSExecutionHistoryClient({
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
    new AWSWorkflowClient({
      sqs: sqs(),
      workflowQueueUrl: workflowQueueUrl ?? env.workflowQueueUrl(),
      executionHistory: createExecutionHistoryClient({
        tableName: tableName ?? env.tableName(),
      }),
      dynamo: dynamo(),
      tableName: tableName ?? env.tableName(),
    }),
  { isEqual: deepEqual }
);

export const createActivityRuntimeClient = /*@__PURE__*/ memoize(
  () =>
    new AWSActivityRuntimeClient({
      activityLockTableName: env.activityLockTableName(),
      dynamo: dynamo(),
    })
);

export const createTimerClient = /*@__PURE__*/ memoize(
  (props: Partial<AWSTimerClientProps> = {}) =>
    new AWSTimerClient({
      scheduler: props.scheduler ?? scheduler(),
      schedulerRoleArn: props.schedulerRoleArn ?? env.schedulerRoleArn(),
      schedulerDlqArn: props.schedulerDlqArn ?? env.schedulerDlqArn(),
      schedulerGroup: props.schedulerGroup ?? env.schedulerGroup(),
      sleepQueueThresholdMillis:
        props.sleepQueueThresholdMillis ?? 15 * 60 * 1000,
      sqs: props.sqs ?? sqs(),
      timerQueueUrl: props.timerQueueUrl ?? env.timerQueueUrl(),
      scheduleForwarderArn:
        props.scheduleForwarderArn ?? env.schedulerForwarderArn(),
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
    new AWSWorkflowRuntimeClient({
      dynamo: dynamo(),
      s3: s3(),
      // todo fail when missing
      executionHistoryBucket:
        executionHistoryBucket ?? env.executionHistoryBucket(),
      tableName: tableName ?? env.tableName(),
      lambda: lambda(),
      activityWorkerFunctionName:
        activityWorkerFunctionName ?? env.activityWorkerFunctionName(),
      workflowClient: createWorkflowClient(),
      timerClient: createTimerClient(),
    })
);
