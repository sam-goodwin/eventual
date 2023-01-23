import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";
import * as env from "./env.js";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { AWSTimerClient, AWSTimerClientProps } from "./clients/timer-client.js";
import { AWSEventClient } from "./clients/event-client.js";
import {
  ActivityStore,
  ExecutionQueueClient,
  ExecutionStore,
  GlobalWorkflowProvider,
  LogAgent,
  LogLevel,
  LogsClient,
  RuntimeServiceClient,
  RuntimeServiceClientProps,
  WorkflowClient,
} from "@eventual/core";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { AWSLogsClient } from "./clients/log-client.js";
import { AWSExecutionStore } from "./stores/execution-store.js";
import { AWSExecutionQueueClient } from "./clients/execution-queue-client.js";
import { AWSExecutionHistoryStateStore } from "./stores/execution-history-state-store.js";
import { AWSExecutionHistoryStore } from "./stores/execution-history-store.js";
import { AWSActivityStore } from "./stores/activity-store.js";
import { AWSActivityClient } from "./clients/activity-client.js";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { InitializeMiddleware } from "@aws-sdk/types";

/**
 * Client creators to be used by the lambda functions.
 *
 * Any used clients should be tree shaken by esbuild.
 * The pure annotations help esbuild determine that theses functions calls have no side effects.
 */

const middlewareTest = (): InitializeMiddleware<any, any> => {
  return (next, context) => async (args) => {
    console.log("middlecontext", context);
    return await next(args);
  };
};

const dynamo = /* @__PURE__ */ memoize(() => new DynamoDBClient({}));
const sqs = /* @__PURE__ */ memoize(() => new SQSClient({}));
const s3 = /* @__PURE__ */ memoize(() => {
  const client = new S3Client({ region: process.env.AWS_REGION });
  client.middlewareStack.add(middlewareTest(), {
    name: "testmiddle",
    step: "initialize",
  });
  return client;
});
const lambda = /* @__PURE__ */ memoize(() => new LambdaClient({}));
const cloudwatchLogs = /* @__PURE__ */ memoize(
  () => new CloudWatchLogsClient({})
);
const scheduler = /* @__PURE__ */ memoize(() => new SchedulerClient({}));
const eventBridge = /* @__PURE__ */ memoize(() => new EventBridgeClient({}));

export const createWorkflowProvider = /* @__PURE__ */ memoize(
  () => new GlobalWorkflowProvider()
);

export const createExecutionHistoryStore = /* @__PURE__ */ memoize(
  ({ tableName }: { tableName?: string } = {}) =>
    new AWSExecutionHistoryStore({
      dynamo: dynamo(),
      tableName: tableName ?? env.tableName,
    }),
  { cacheKey: (opts) => opts?.tableName ?? env.tableName }
);

export const createWorkflowClient = /* @__PURE__ */ memoize(
  ({
    logsClient,
    executionStore,
    executionQueueClient,
  }: {
    logsClient?: LogsClient;
    executionStore?: ExecutionStore;
    executionQueueClient?: ExecutionQueueClient;
  } = {}) =>
    new WorkflowClient(
      executionStore ?? createExecutionStore(),
      logsClient ?? createLogsClient(),
      executionQueueClient ?? createExecutionQueueClient(),
      createWorkflowProvider()
    )
);

export const createExecutionQueueClient = /* @__PURE__ */ memoize(
  ({ workflowQueueUrl }: { workflowQueueUrl?: string } = {}) =>
    new AWSExecutionQueueClient({
      sqs: sqs(),
      workflowQueueUrl: workflowQueueUrl ?? env.workflowQueueUrl,
    })
);

export const createExecutionStore = /* @__PURE__ */ memoize(
  ({ tableName }: { tableName?: string } = {}) =>
    new AWSExecutionStore({
      dynamo: dynamo(),
      tableName: tableName ?? env.tableName,
    })
);

export const createLogsClient = /* @__PURE__ */ memoize(
  ({ serviceLogGroup }: { serviceLogGroup?: string } = {}) =>
    new AWSLogsClient({
      cloudwatchLogsClient: cloudwatchLogs(),
      serviceLogGroup: serviceLogGroup ?? env.serviceLogGroupName,
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
        default: defaultLogLevel ?? env.defaultLogLevel,
      },
    });
  }
);

export const createActivityStore = /* @__PURE__ */ memoize(
  ({ activityTableName }: { activityTableName?: string } = {}) =>
    new AWSActivityStore({
      activityTableName: activityTableName ?? env.activityTableName,
      dynamo: dynamo(),
    })
);

export const createTimerClient = /* @__PURE__ */ memoize(
  (props: Partial<AWSTimerClientProps> = {}) =>
    new AWSTimerClient({
      scheduler: props.scheduler ?? scheduler(),
      schedulerRoleArn: props.schedulerRoleArn ?? env.schedulerRoleArn,
      schedulerDlqArn: props.schedulerDlqArn ?? env.schedulerDlqArn,
      schedulerGroup: props.schedulerGroup ?? env.schedulerGroup,
      timerQueueThresholdSeconds: props.timerQueueThresholdSeconds ?? 15 * 60,
      sqs: props.sqs ?? sqs(),
      timerQueueUrl: props.timerQueueUrl ?? env.timerQueueUrl,
      scheduleForwarderArn:
        props.scheduleForwarderArn ?? env.schedulerForwarderArn,
    })
);

export const createActivityClient = /* @__PURE__ */ memoize(
  ({
    activityWorkerFunctionName,
    executionQueueClient,
    executionStore,
    activityStore,
  }: {
    activityWorkerFunctionName?: string;
    activityStore?: ActivityStore;
    executionQueueClient?: ExecutionQueueClient;
    executionStore?: ExecutionStore;
  } = {}) =>
    new AWSActivityClient({
      lambda: lambda(),
      activityWorkerFunctionName:
        activityWorkerFunctionName ?? env.activityWorkerFunctionName,
      executionQueueClient:
        executionQueueClient ?? createExecutionQueueClient(),
      executionStore: executionStore ?? createExecutionStore(),
      activityStore: activityStore ?? createActivityStore(),
    })
);

export const createExecutionHistoryStateStore = /* @__PURE__ */ memoize(
  ({ executionHistoryBucket }: { executionHistoryBucket?: string } = {}) =>
    new AWSExecutionHistoryStateStore({
      s3: s3(),
      executionHistoryBucket:
        executionHistoryBucket ?? env.executionHistoryBucket,
    })
);

export const createEventClient = /* @__PURE__ */ memoize(
  () =>
    new AWSEventClient({
      serviceName: env.serviceName,
      eventBusArn: env.eventBusArn,
      eventBridgeClient: eventBridge(),
    })
);

export const createServiceClient = memoize(
  ({
    activityClient,
    eventClient,
    executionHistoryStateStore,
    executionHistoryStore,
    executionQueueClient,
    executionStore,
    workflowClient,
  }: Partial<RuntimeServiceClientProps> = {}) =>
    new RuntimeServiceClient({
      eventClient: eventClient ?? createEventClient(),
      executionHistoryStore:
        executionHistoryStore ?? createExecutionHistoryStore(),
      workflowClient: workflowClient ?? createWorkflowClient(),
      executionQueueClient:
        executionQueueClient ?? createExecutionQueueClient(),
      executionStore: executionStore ?? createExecutionStore(),
      executionHistoryStateStore:
        executionHistoryStateStore ?? createExecutionHistoryStateStore(),
      activityClient: activityClient ?? createActivityClient(),
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
