import { LogLevel } from "@eventual/core";
import { assertNonNull } from "@eventual/core/internal";

export const ENV_NAMES = {
  SERVICE_NAME: "EVENTUAL_SERVICE_NAME",
  SERVICE_URL: "EVENTUAL_SERVICE_URL",
  EXECUTION_TABLE_NAME: "EVENTUAL_EXECUTION_TABLE_NAME",
  EXECUTION_HISTORY_TABLE_NAME: "EVENTUAL_EXECUTION_HISTORY_TABLE_NAME",
  EXECUTION_HISTORY_BUCKET: "EVENTUAL_EXECUTION_HISTORY_BUCKET",
  EVENT_BUS_ARN: "EVENTUAL_EVENT_BUS_ARN",
  WORKFLOW_QUEUE_URL: "EVENTUAL_WORKFLOW_QUEUE_URL",
  ACTIVITY_TABLE_NAME: "EVENTUAL_ACTIVITY_TABLE_NAME",
  SCHEDULER_ROLE_ARN: "EVENTUAL_SCHEDULER_ROLE_ARN",
  SCHEDULER_DLQ_ROLE_ARN: "EVENTUAL_SCHEDULER_DLQ_ROLE_ARN",
  SCHEDULER_GROUP: "EVENTUAL_SCHEDULER_GROUP",
  TIMER_QUEUE_URL: "EVENTUAL_TIMER_QUEUE_URL",
  SCHEDULE_FORWARDER_ARN: "EVENTUAL_SCHEDULE_FORWARDER_ARN",
  WORKFLOW_EXECUTION_LOG_GROUP_NAME:
    "EVENTUAL_WORKFLOW_EXECUTION_LOG_GROUP_NAME",
  DEFAULT_LOG_LEVEL: "EVENTUAL_LOG_LEVEL",
  DICTIONARY_NAME: "EVENTUAL_DICTIONARY_NAME",
  DICTIONARY_STREAM_NAME: "EVENTUAL_DICTIONARY_STREAM_NAME",
} as const;

export function tryGetEnv<T extends string = string>(name: string) {
  return assertNonNull<T>(
    process.env[name] as T | undefined,
    `Expected env variable ${name} to be present.`
  ) as T;
}

export const serviceName = () => tryGetEnv(ENV_NAMES.SERVICE_NAME);
export const executionTableName = () =>
  tryGetEnv(ENV_NAMES.EXECUTION_TABLE_NAME);
export const executionHistoryTableName = () =>
  tryGetEnv(ENV_NAMES.EXECUTION_HISTORY_TABLE_NAME);
export const eventBusArn = () => tryGetEnv(ENV_NAMES.EVENT_BUS_ARN);
export const executionHistoryBucket = () =>
  tryGetEnv(ENV_NAMES.EXECUTION_HISTORY_BUCKET);
export const workflowQueueUrl = () => tryGetEnv(ENV_NAMES.WORKFLOW_QUEUE_URL);
export const activityTableName = () => tryGetEnv(ENV_NAMES.ACTIVITY_TABLE_NAME);
export const schedulerRoleArn = () => tryGetEnv(ENV_NAMES.SCHEDULER_ROLE_ARN);
export const schedulerDlqArn = () =>
  tryGetEnv(ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN);
export const schedulerGroup = () => tryGetEnv(ENV_NAMES.SCHEDULER_GROUP);
export const timerQueueUrl = () => tryGetEnv(ENV_NAMES.TIMER_QUEUE_URL);
export const schedulerForwarderArn = () =>
  tryGetEnv(ENV_NAMES.SCHEDULE_FORWARDER_ARN);
export const serviceLogGroupName = () =>
  tryGetEnv(ENV_NAMES.WORKFLOW_EXECUTION_LOG_GROUP_NAME);
export const serviceUrl = () => tryGetEnv<LogLevel>(ENV_NAMES.SERVICE_URL);
export const defaultLogLevel = () =>
  tryGetEnv<LogLevel>(ENV_NAMES.DEFAULT_LOG_LEVEL) ?? LogLevel.INFO;
export const dictionaryName = () => tryGetEnv(ENV_NAMES.DICTIONARY_NAME);
export const dictionaryStreamName = () => tryGetEnv(ENV_NAMES.DICTIONARY_STREAM_NAME);
