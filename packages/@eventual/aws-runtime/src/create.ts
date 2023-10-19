import { ApiGatewayManagementApiClient } from "@aws-sdk/client-apigatewaymanagementapi";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { SchedulerClient } from "@aws-sdk/client-scheduler";
import { SQSClient } from "@aws-sdk/client-sqs";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Client, Pluggable } from "@aws-sdk/types";
import { AWSHttpEventualClient } from "@eventual/aws-client";
import { LogLevel } from "@eventual/core";
import {
  ExecutionQueueClient,
  ExecutionStore,
  GlobalEntityProvider,
  GlobalQueueProvider,
  GlobalTaskProvider,
  GlobalWorkflowProvider,
  LogAgent,
  LogsClient,
  RuntimeFallbackServiceClient,
  RuntimeServiceClientProps,
  TaskStore,
  WorkflowClient,
  WorkflowSpecProvider,
} from "@eventual/core-runtime";
import type { ServiceSpec } from "@eventual/core/internal";
import { AWSEventClient } from "./clients/event-client.js";
import { AWSExecutionQueueClient } from "./clients/execution-queue-client.js";
import { AWSLogsClient } from "./clients/logs-client.js";
import { AWSOpenSearchClient } from "./clients/opensearch-client.js";
import { AWSQueueClient } from "./clients/queue-client.js";
import { AWSSocketClient } from "./clients/socket-client.js";
import { AWSTaskClient } from "./clients/task-client.js";
import { AWSTimerClient, AWSTimerClientProps } from "./clients/timer-client.js";
import { AWSTransactionClient } from "./clients/transaction-client.js";
import * as env from "./env.js";
import { socketUrls } from "./env.js";
import { AWSBucketStore } from "./stores/bucket-store.js";
import { AWSEntityStore } from "./stores/entity-store.js";
import { AWSExecutionHistoryStateStore } from "./stores/execution-history-state-store.js";
import { AWSExecutionHistoryStore } from "./stores/execution-history-store.js";
import { AWSExecutionStore } from "./stores/execution-store.js";
import { AWSTaskStore } from "./stores/task-store.js";

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
  ({
    executionHistoryTableName,
  }: { executionHistoryTableName?: string } = {}) =>
    new AWSExecutionHistoryStore({
      dynamo: dynamo(),
      executionHistoryTableName:
        executionHistoryTableName ?? env.executionHistoryTableName,
    })
);

export const createWorkflowClient = /* @__PURE__ */ memoize(
  ({
    logsClient,
    executionStore,
    executionQueueClient,
    workflowProvider,
  }: {
    logsClient?: LogsClient;
    executionStore?: ExecutionStore;
    executionQueueClient?: ExecutionQueueClient;
    workflowProvider?: WorkflowSpecProvider;
  } = {}) =>
    new WorkflowClient(
      executionStore ?? createExecutionStore(),
      logsClient ?? createLogsClient(),
      executionQueueClient ?? createExecutionQueueClient(),
      workflowProvider ?? createWorkflowProvider()
    )
);

export const createApiGatewayManagementClient = /* @__PURE__ */ memoize(
  ({ socketUrl }: { socketUrl: string }) =>
    new ApiGatewayManagementApiClient({ endpoint: socketUrl })
);

export const createSocketClient = /* @__PURE__ */ memoize(() => {
  return new AWSSocketClient({
    socketUrls,
    apiGatewayManagementClientRetriever: (url) =>
      createApiGatewayManagementClient({ socketUrl: url }),
  });
});

export const createExecutionQueueClient = /* @__PURE__ */ memoize(
  ({ workflowQueueUrl }: { workflowQueueUrl?: string } = {}) =>
    new AWSExecutionQueueClient({
      sqs: sqs(),
      workflowQueueUrl: workflowQueueUrl ?? env.workflowQueueUrl,
    })
);

export const createExecutionStore = /* @__PURE__ */ memoize(
  ({ executionTableName }: { executionTableName?: string } = {}) =>
    new AWSExecutionStore({
      dynamo: dynamo(),
      executionTableName: executionTableName ?? env.executionTableName,
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

export const createTaskStore = /* @__PURE__ */ memoize(
  ({ taskTableName }: { taskTableName?: string } = {}) =>
    new AWSTaskStore({
      taskTableName: taskTableName ?? env.taskTableName,
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

export const createTaskClient = /* @__PURE__ */ memoize(
  ({
    executionQueueClient,
    executionStore,
    taskStore,
  }: {
    taskStore?: TaskStore;
    executionQueueClient?: ExecutionQueueClient;
    executionStore?: ExecutionStore;
  } = {}) =>
    new AWSTaskClient({
      taskProvider: new GlobalTaskProvider(),
      taskStore: taskStore ?? createTaskStore(),
      executionQueueClient:
        executionQueueClient ?? createExecutionQueueClient(),
      executionStore: executionStore ?? createExecutionStore(),
      lambda: lambda(),
      serviceName: env.serviceName,
    })
);

export const createQueueClient = memoize(() => {
  return new AWSQueueClient({
    sqs: sqs(),
    awsAccount: env.awsAccount,
    serviceName: env.serviceName,
    awsRegion: env.awsRegion,
    queueOverrides: env.queueOverrides,
    queueProvider: new GlobalQueueProvider(),
  });
});

export const createExecutionHistoryStateStore = /* @__PURE__ */ memoize(
  ({ executionHistoryBucket }: { executionHistoryBucket?: string } = {}) =>
    new AWSExecutionHistoryStateStore({
      s3: s3(),
      executionHistoryBucket:
        executionHistoryBucket ?? env.executionHistoryBucket,
    })
);

export const createEntityStore = memoize(
  () =>
    new AWSEntityStore({
      dynamo: dynamo(),
      serviceName: env.serviceName,
      entityProvider: new GlobalEntityProvider(),
    })
);

export const createBucketStore = memoize(
  () =>
    new AWSBucketStore({
      s3: s3(),
      serviceName: env.serviceName,
      bucketOverrides: env.bucketOverrides,
      accountID: env.awsAccount,
      region: env.awsRegion,
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

export const createServiceClient = /* @__PURE__ */ memoize(
  ({
    eventClient,
    executionHistoryStateStore,
    executionHistoryStore,
    executionQueueClient,
    executionStore,
    logsClient,
    serviceUrl,
    taskClient,
    workflowClient,
    workflowProvider,
  }: Partial<RuntimeServiceClientProps> & { serviceUrl?: string }) =>
    new RuntimeFallbackServiceClient(
      {
        eventClient,
        executionHistoryStore,
        executionQueueClient,
        executionStore,
        executionHistoryStateStore,
        logsClient,
        taskClient,
        workflowClient,
        workflowProvider,
      },
      createHttpServiceClient({ serviceUrl })
    )
);

export const createTransactionClient = memoize(() => {
  return new AWSTransactionClient({
    lambda: lambda(),
    transactionWorkerFunctionArn: env.transactionWorkerArn,
  });
});

export const createHttpServiceClient = /* @__PURE__ */ memoize(
  ({ serviceUrl }: { serviceUrl?: string } = {}) =>
    new AWSHttpEventualClient({ serviceUrl: serviceUrl ?? env.serviceUrl() })
);

export const createOpenSearchClient = /* @__PURE__ */ memoize(
  async (serviceSpec?: ServiceSpec) => {
    if (serviceSpec?.search.indices.length === 0) {
      return undefined;
    } else {
      const credentials = await defaultProvider()();
      const region = env.awsRegion();

      return new AWSOpenSearchClient({
        credentials,
        region,
        node: env.openSearchEndpoint(),
      });
    }
  }
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
