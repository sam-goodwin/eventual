import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { SQSClient } from "@aws-sdk/client-sqs";
import { Client, Pluggable } from "@aws-sdk/types";
import { LogLevel } from "@eventual/core";
import {
  ActivityStore,
  ExecutionQueueClient,
  ExecutionStore,
  GlobalWorkflowProvider,
  LogAgent,
  LogsClient,
  RuntimeServiceClient,
  RuntimeServiceClientProps,
  WorkflowClient,
} from "@eventual/runtime-core";
import { AWSActivityClient } from "./clients/activity-client.js";
import { AWSEventClient } from "./clients/event-client.js";
import { AWSExecutionQueueClient } from "./clients/execution-queue-client.js";
import { AWSLogsClient } from "./clients/log-client.js";
import { AWSTimerClient, AWSTimerClientProps } from "./clients/timer-client.js";
import * as env from "./env.js";
import { AWSActivityStore } from "./stores/activity-store.js";
import { AWSExecutionHistoryStateStore } from "./stores/execution-history-state-store.js";
import { AWSExecutionHistoryStore } from "./stores/execution-history-store.js";
import { AWSExecutionStore } from "./stores/execution-store.js";

/**
 * Client creators to be used by the lambda functions.
 *
 * Any used clients should be tree shaken by esbuild.
 * The pure annotations help esbuild determine that theses functions calls have no side effects.
 */

const awsSDKPlugin = process.env.EVENTUAL_AWS_SDK_PLUGIN
  ? require(process.env.EVENTUAL_AWS_SDK_PLUGIN)
  : undefined;

if (
  awsSDKPlugin &&
  awsSDKPlugin.default &&
  !isAwsSDKPluggble(awsSDKPlugin.default)
) {
  throw new Error(
    `Expected entry point ${
      process.env.EVENTUAL_AWS_SDK_PLUGIN
    } in defined EVENTUAL_AWS_SDK_PLUGIN to be a AWS-SDK plugin. ${JSON.stringify(
      awsSDKPlugin
    )}`
  );
}

function clientWithPlugin<C extends Client<any, any, any>>(client: C): C {
  if (awsSDKPlugin) {
    client.middlewareStack.use(awsSDKPlugin.default);
  }
  return client;
}

const dynamo = /* @__PURE__ */ memoize(() =>
  clientWithPlugin(new DynamoDBClient({}))
);
const sqs = /* @__PURE__ */ memoize(() => clientWithPlugin(new SQSClient({})));
const s3 = /* @__PURE__ */ memoize(() =>
  clientWithPlugin(new S3Client({ region: process.env.AWS_REGION }))
);
const lambda = /* @__PURE__ */ memoize(() =>
  clientWithPlugin(new LambdaClient({}))
);
const cloudwatchLogs = /* @__PURE__ */ memoize(() =>
  clientWithPlugin(new CloudWatchLogsClient({}))
);
const scheduler = /* @__PURE__ */ memoize(() =>
  clientWithPlugin(new SchedulerClient({}))
);
const eventBridge = /* @__PURE__ */ memoize(() =>
  clientWithPlugin(new EventBridgeClient({}))
);

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

function isAwsSDKPluggble(p: any): p is Pluggable<any, any> {
  return p && "applyToStack" in p;
}
