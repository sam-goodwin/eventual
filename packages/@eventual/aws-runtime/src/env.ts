import { assertNonNull, LogLevel } from "@eventual/core";

export const ENV_NAMES = {
  SERVICE_NAME: "EVENTUAL_SERVICE_NAME",
  TABLE_NAME: "EVENTUAL_TABLE_NAME",
  EXECUTION_HISTORY_BUCKET: "EVENTUAL_EXECUTION_HISTORY_BUCKET",
  EVENT_BUS_ARN: "EVENTUAL_EVENT_BUS_ARN",
  WORKFLOW_QUEUE_URL: "EVENTUAL_WORKFLOW_QUEUE_URL",
  ACTIVITY_WORKER_FUNCTION_NAME: "ACTIVITY_WORKER_FUNCTION_NAME",
  ACTIVITY_TABLE_NAME: "EVENTUAL_ACTIVITY_TABLE_NAME",
  SCHEDULER_ROLE_ARN: "EVENTUAL_SCHEDULER_ROLE_ARN",
  SCHEDULER_DLQ_ROLE_ARN: "EVENTUAL_SCHEDULER_DLQ_ROLE_ARN",
  SCHEDULER_GROUP: "EVENTUAL_SCHEDULER_GROUP",
  TIMER_QUEUE_URL: "EVENTUAL_TIMER_QUEUE_URL",
  SCHEDULE_FORWARDER_ARN: "EVENTUAL_SCHEDULE_FORWARDER_ARN",
  SERVICE_LOG_GROUP_NAME: "EVENTUAL_SERVICE_LOG_GROUP_NAME",
  DEFAULT_LOG_LEVEL: "EVENTUAL_LOG_LEVEL",
} as const;

export function lazyEnv<T extends string = string>(env: string): T {
  return new Proxy({}, { get: () => tryGetEnv<T>(env) }) as T;
}

export function tryGetEnv<T extends string = string>(name: string) {
  return assertNonNull<T>(
    process.env[name] as T | undefined,
    `Expected env variable ${name} to be present.`
  ) as T;
}

export const serviceName = lazyEnv(ENV_NAMES.SERVICE_NAME);
export const tableName = lazyEnv(ENV_NAMES.TABLE_NAME);
export const eventBusArn = lazyEnv(ENV_NAMES.EVENT_BUS_ARN);
export const executionHistoryBucket = lazyEnv(
  ENV_NAMES.EXECUTION_HISTORY_BUCKET
);
export const workflowQueueUrl = lazyEnv(ENV_NAMES.WORKFLOW_QUEUE_URL);
export const activityWorkerFunctionName = lazyEnv(
  ENV_NAMES.ACTIVITY_WORKER_FUNCTION_NAME
);
export const activityTableName = lazyEnv(ENV_NAMES.ACTIVITY_TABLE_NAME);
export const schedulerRoleArn = lazyEnv(ENV_NAMES.SCHEDULER_ROLE_ARN);
export const schedulerDlqArn = lazyEnv(ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN);
export const schedulerGroup = lazyEnv(ENV_NAMES.SCHEDULER_GROUP);
export const timerQueueUrl = lazyEnv(ENV_NAMES.TIMER_QUEUE_URL);
export const schedulerForwarderArn = lazyEnv(ENV_NAMES.SCHEDULE_FORWARDER_ARN);
export const serviceLogGroupName = lazyEnv(ENV_NAMES.SERVICE_LOG_GROUP_NAME);
export const defaultLogLevel = lazyEnv<LogLevel>(ENV_NAMES.DEFAULT_LOG_LEVEL);
