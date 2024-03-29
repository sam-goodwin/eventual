import { LogLevel } from "@eventual/core";
import { assertNonNull } from "@eventual/core/internal";
import type { QueueRuntimeOverrides } from "./clients/queue-client.js";
import type { SocketEndpoints } from "./clients/socket-client.js";
import type { BucketRuntimeOverrides } from "./stores/bucket-store.js";

export const ENV_NAMES = {
  AWS_ACCOUNT_ID: "EVENTUAL_AWS_ACCOUNT_ID",
  SERVICE_NAME: "EVENTUAL_SERVICE_NAME",
  SERVICE_URL: "EVENTUAL_SERVICE_URL",
  EXECUTION_TABLE_NAME: "EVENTUAL_EXECUTION_TABLE_NAME",
  EXECUTION_HISTORY_TABLE_NAME: "EVENTUAL_EXECUTION_HISTORY_TABLE_NAME",
  EXECUTION_HISTORY_BUCKET: "EVENTUAL_EXECUTION_HISTORY_BUCKET",
  EVENT_BUS_ARN: "EVENTUAL_EVENT_BUS_ARN",
  WORKFLOW_QUEUE_URL: "EVENTUAL_WORKFLOW_QUEUE_URL",
  TASK_TABLE_NAME: "EVENTUAL_TASK_TABLE_NAME",
  OPENSEARCH_ENDPOINT: "EVENTUAL_OPENSEARCH_ENDPOINT",
  SCHEDULER_ROLE_ARN: "EVENTUAL_SCHEDULER_ROLE_ARN",
  SCHEDULER_DLQ_ROLE_ARN: "EVENTUAL_SCHEDULER_DLQ_ROLE_ARN",
  SCHEDULER_GROUP: "EVENTUAL_SCHEDULER_GROUP",
  TIMER_QUEUE_URL: "EVENTUAL_TIMER_QUEUE_URL",
  SCHEDULE_FORWARDER_ARN: "EVENTUAL_SCHEDULE_FORWARDER_ARN",
  WORKFLOW_EXECUTION_LOG_GROUP_NAME:
    "EVENTUAL_WORKFLOW_EXECUTION_LOG_GROUP_NAME",
  DEFAULT_LOG_LEVEL: "EVENTUAL_LOG_LEVEL",
  SOCKET_NAME: "EVENTUAL_SOCKET_NAME",
  SOCKET_URLS: "EVENTUAL_SOCKET_URLS",
  ENTITY_NAME: "EVENTUAL_ENTITY_NAME",
  ENTITY_STREAM_NAME: "EVENTUAL_ENTITY_STREAM_NAME",
  QUEUE_NAME: "EVENTUAL_QUEUE_NAME",
  BUCKET_NAME: "EVENTUAL_BUCKET_NAME",
  BUCKET_HANDLER_NAME: "EVENTUAL_BUCKET_HANDLER_NAME",
  TRANSACTION_WORKER_ARN: "EVENTUAL_TRANSACTION_WORKER_ARN",
  BUCKET_OVERRIDES: "EVENTUAL_BUCKET_OVERRIDES",
  QUEUE_OVERRIDES: "EVENTUAL_QUEUE_OVERRIDES",
} as const;

export function tryGetEnv<T extends string = string>(name: string) {
  return assertNonNull<T>(
    process.env[name] as T | undefined,
    `Expected env variable ${name} to be present.`
  ) as T;
}

export const awsAccount = () => tryGetEnv(ENV_NAMES.AWS_ACCOUNT_ID);
export const awsRegion = () => tryGetEnv("AWS_REGION");
export const serviceName = () => tryGetEnv(ENV_NAMES.SERVICE_NAME);
export const openSearchEndpoint = () =>
  tryGetEnv(ENV_NAMES.OPENSEARCH_ENDPOINT);
export const executionTableName = () =>
  tryGetEnv(ENV_NAMES.EXECUTION_TABLE_NAME);
export const executionHistoryTableName = () =>
  tryGetEnv(ENV_NAMES.EXECUTION_HISTORY_TABLE_NAME);
export const eventBusArn = () => tryGetEnv(ENV_NAMES.EVENT_BUS_ARN);
export const executionHistoryBucket = () =>
  tryGetEnv(ENV_NAMES.EXECUTION_HISTORY_BUCKET);
export const workflowQueueUrl = () => tryGetEnv(ENV_NAMES.WORKFLOW_QUEUE_URL);
export const taskTableName = () => tryGetEnv(ENV_NAMES.TASK_TABLE_NAME);
export const schedulerRoleArn = () => tryGetEnv(ENV_NAMES.SCHEDULER_ROLE_ARN);
export const schedulerDlqArn = () =>
  tryGetEnv(ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN);
export const schedulerGroup = () => tryGetEnv(ENV_NAMES.SCHEDULER_GROUP);
export const timerQueueUrl = () => tryGetEnv(ENV_NAMES.TIMER_QUEUE_URL);
export const schedulerForwarderArn = () =>
  tryGetEnv(ENV_NAMES.SCHEDULE_FORWARDER_ARN);
export const serviceLogGroupName = () =>
  tryGetEnv(ENV_NAMES.WORKFLOW_EXECUTION_LOG_GROUP_NAME);
export const serviceUrl = () => tryGetEnv<string>(ENV_NAMES.SERVICE_URL);
export const defaultLogLevel = () =>
  tryGetEnv<LogLevel>(ENV_NAMES.DEFAULT_LOG_LEVEL) ?? LogLevel.INFO;
export const socketName = () => tryGetEnv(ENV_NAMES.SOCKET_NAME);
export const entityName = () => tryGetEnv(ENV_NAMES.ENTITY_NAME);
export const entityStreamName = () => tryGetEnv(ENV_NAMES.ENTITY_STREAM_NAME);
export const bucketName = () => tryGetEnv(ENV_NAMES.BUCKET_NAME);
export const bucketHandlerName = () => tryGetEnv(ENV_NAMES.BUCKET_HANDLER_NAME);
export const queueName = () => tryGetEnv(ENV_NAMES.QUEUE_NAME);
export const transactionWorkerArn = () =>
  tryGetEnv(ENV_NAMES.TRANSACTION_WORKER_ARN);
export const bucketOverrides = () => {
  const bucketOverridesString = process.env[ENV_NAMES.BUCKET_OVERRIDES] ?? "{}";
  return JSON.parse(bucketOverridesString) as Record<
    string,
    BucketRuntimeOverrides
  >;
};
export const queueOverrides = () => {
  const queueOverridesString = process.env[ENV_NAMES.QUEUE_OVERRIDES] ?? "{}";
  return JSON.parse(queueOverridesString) as Record<
    string,
    QueueRuntimeOverrides
  >;
};
export const socketUrls = () => {
  const socketUrlsString = process.env[ENV_NAMES.SOCKET_URLS] ?? "{}";
  return JSON.parse(socketUrlsString) as SocketEndpoints;
};
