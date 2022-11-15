import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import {
  tableName,
  workflowQueueUrl,
  activityLockTableName,
  activityWorkerFunctionName,
  executionHistoryBucket,
} from "../env";
import { ActivityRuntimeClient } from "./activity-runtime-client";
import { ExecutionHistoryClient } from "./execution-history-client";
import { WorkflowClient } from "./workflow-client";
import { WorkflowRuntimeClient } from "./workflow-runtime-client";

/**
 * Lazily maintain whatever is returned by the create function as a singleton.
 */
function memoize<T>(create: () => T) {
  let created = false;
  let t: T;
  return () => {
    if (!created) {
      created = true;
      return (t = create());
    }
    return t;
  };
}

/**
 * Client creators to be used by the lambda functions.
 *
 * Any used clients should be tree shaken by esbuild.
 * The pure annotations help esbuild determine that theses functions calls have no side effects.
 */

const dynamo = /*@__PURE__*/ memoize(() => new DynamoDBClient({}));
const sqs = /*@__PURE__*/ memoize(() => new SQSClient({}));
const s3 = /*@__PURE__*/ memoize(
  () => new S3Client({ region: process.env.AWS_REGION })
);
const lambda = /*@__PURE__*/ memoize(() => new LambdaClient({}));

export const createExecutionHistoryClient = /*@__PURE__*/ memoize(
  () =>
    new ExecutionHistoryClient({
      dynamo: dynamo(),
      tableName: tableName(),
    })
);

export const createWorkflowClient = /*@__PURE__*/ memoize(
  () =>
    new WorkflowClient({
      sqs: sqs(),
      workflowQueueUrl: workflowQueueUrl(),
      executionHistory: createExecutionHistoryClient(),
      dynamo: dynamo(),
      tableName: tableName(),
    })
);

export const createActivityRuntimeClient = /*@__PURE__*/ memoize(
  () =>
    new ActivityRuntimeClient({
      activityLockTableName: activityLockTableName(),
      dynamo: dynamo(),
    })
);

export const createWorkflowRuntimeClient = /*@__PURE__*/ memoize(
  () =>
    new WorkflowRuntimeClient({
      dynamo: dynamo(),
      s3: s3(),
      // todo fail when missing
      executionHistoryBucket: executionHistoryBucket(),
      tableName: tableName(),
      lambda: lambda(),
      activityWorkerFunctionName: activityWorkerFunctionName(),
    })
);
