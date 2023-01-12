import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import * as env from "../env.js";
import { AWSActivityRuntimeClient } from "./activity-runtime-client.js";
import { AWSExecutionHistoryClient } from "./execution-history-client.js";
import { AWSWorkflowClient } from "./workflow-client.js";
import { AWSWorkflowRuntimeClient } from "./workflow-runtime-client.js";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { AWSTimerClient, AWSTimerClientProps } from "./timer-client.js";
import { AWSEventClient } from "./event-client.js";
import {
  LogAgent,
  LogLevel,
  LogsClient,
  RuntimeServiceClient,
  TimerClient,
  WorkflowClient,
  WorkflowRuntimeClient,
} from "@eventual/core";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { AWSLogsClient } from "./log-client.js";

/**
 * Client creators to be used by the lambda functions.
 *
 * Any used clients should be tree shaken by esbuild.
 * The pure annotations help esbuild determine that theses functions calls have no side effects.
 */

const dynamo = /* @__PURE__ */ memoize(() => new DynamoDBClient({}));
const sqs = /* @__PURE__ */ memoize(() => new SQSClient({}));
const s3 = /* @__PURE__ */ memoize(
  () => new S3Client({ region: process.env.AWS_REGION })
);
const lambda = /* @__PURE__ */ memoize(() => new LambdaClient({}));
const cloudwatchLogs = /* @__PURE__ */ memoize(
  () => new CloudWatchLogsClient({})
);
const scheduler = /* @__PURE__ */ memoize(() => new SchedulerClient({}));

export const createExecutionHistoryClient = /* @__PURE__ */ memoize(
  ({ tableName }: { tableName?: string } = {}) =>
    new AWSExecutionHistoryClient({
      dynamo: dynamo(),
      tableName: tableName ?? env.tableName(),
    }),
  { cacheKey: (opts) => opts?.tableName ?? env.tableName() }
);

export const createWorkflowClient = /* @__PURE__ */ memoize(
  ({
    tableName,
    workflowQueueUrl,
    activityTableName,
    logsClient,
  }: {
    tableName?: string;
    workflowQueueUrl?: string;
    activityTableName?: string;
    logsClient?: LogsClient;
  } = {}) =>
    new AWSWorkflowClient({
      sqs: sqs(),
      workflowQueueUrl: workflowQueueUrl ?? env.workflowQueueUrl(),
      dynamo: dynamo(),
      tableName: tableName ?? env.tableName(),
      activityRuntimeClient: createActivityRuntimeClient({ activityTableName }),
      logsClient: logsClient ?? createLogsClient(),
    }),
  { cacheKey: JSON.stringify }
);

export const createLogsClient = /* @__PURE__ */ memoize(
  ({ serviceLogGroup }: { serviceLogGroup?: string } = {}) =>
    new AWSLogsClient({
      cloudwatchLogsClient: cloudwatchLogs(),
      serviceLogGroup: serviceLogGroup ?? env.serviceLogGroupName(),
    })
);

export const createLogAgent = /* @__PURE__ */ memoize(
  ({
    logsClient,
    defaultLogLevel,
  }: {
    logsClient?: LogsClient;
    defaultLogLevel?: LogLevel;
  } = {}) => {
    return new LogAgent({
      logsClient: logsClient ?? createLogsClient(),
      logLevel: {
        default:
          defaultLogLevel ??
          (process.env[env.ENV_NAMES.DEFAULT_LOG_LEVEL] as
            | LogLevel
            | undefined) ??
          LogLevel.INFO,
      },
    });
  }
);

export const createActivityRuntimeClient = /* @__PURE__ */ memoize(
  ({ activityTableName }: { activityTableName?: string } = {}) =>
    new AWSActivityRuntimeClient({
      activityTableName: activityTableName ?? env.activityTableName(),
      dynamo: dynamo(),
    })
);

export const createTimerClient = /* @__PURE__ */ memoize(
  (props: Partial<AWSTimerClientProps> = {}) =>
    new AWSTimerClient({
      scheduler: props.scheduler ?? scheduler(),
      schedulerRoleArn: props.schedulerRoleArn ?? env.schedulerRoleArn(),
      schedulerDlqArn: props.schedulerDlqArn ?? env.schedulerDlqArn(),
      schedulerGroup: props.schedulerGroup ?? env.schedulerGroup(),
      sleepQueueThresholdSeconds: props.sleepQueueThresholdSeconds ?? 15 * 60,
      sqs: props.sqs ?? sqs(),
      timerQueueUrl: props.timerQueueUrl ?? env.timerQueueUrl(),
      scheduleForwarderArn:
        props.scheduleForwarderArn ?? env.schedulerForwarderArn(),
    }),
  { cacheKey: JSON.stringify }
);

export const createWorkflowRuntimeClient = /* @__PURE__ */ memoize(
  ({
    tableName = env.tableName(),
    executionHistoryBucket = env.executionHistoryBucket(),
    activityWorkerFunctionName = env.activityWorkerFunctionName(),
    timerClient,
    workflowClient,
  }: {
    tableName?: string;
    executionHistoryBucket?: string;
    activityWorkerFunctionName?: string;
    timerClient?: TimerClient;
    workflowClient?: WorkflowClient;
  } = {}) =>
    new AWSWorkflowRuntimeClient({
      dynamo: dynamo(),
      s3: s3(),
      // todo fail when missing
      executionHistoryBucket,
      tableName,
      lambda: lambda(),
      activityWorkerFunctionName,
      workflowClient: workflowClient ?? createWorkflowClient(),
      timerClient: timerClient ?? createTimerClient(),
    }),
  { cacheKey: JSON.stringify }
);

export const createEventClient = /* @__PURE__ */ memoize(
  () =>
    new AWSEventClient({
      serviceName: env.serviceName(),
      eventBusArn: env.eventBusArn(),
    })
);

export const createServiceClient = memoize(
  (workflowRuntimeClient?: WorkflowRuntimeClient) =>
    new RuntimeServiceClient({
      eventClient: createEventClient(),
      executionHistoryClient: createExecutionHistoryClient(),
      workflowClient: createWorkflowClient(),
      workflowRuntimeClient:
        workflowRuntimeClient ?? createWorkflowRuntimeClient(),
    })
);

function memoize<T extends (...args: any[]) => any>(
  fn: T,
  options?: {
    cacheKey: (...args: Parameters<T>) => any;
  }
): (...args: Parameters<T>) => ReturnType<T> {
  // We box our cache in case our fn returns undefined
  const resMap = new Map<any, { value: ReturnType<T> }>();
  return (...args) => {
    const key = options?.cacheKey ? options.cacheKey(...args) : args;
    const cachedResult = resMap.get(key);
    if (cachedResult) {
      return cachedResult.value;
    } else {
      const result = fn(...args);
      resMap.set(key, { value: result });
      return result;
    }
  };
}
