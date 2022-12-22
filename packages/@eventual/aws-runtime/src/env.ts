import { assertNonNull } from "@eventual/core";

export namespace ENV_NAMES {
  export const SERVICE_NAME = "EVENTUAL_SERVICE_NAME";
  export const TABLE_NAME = "EVENTUAL_TABLE_NAME";
  export const EXECUTION_HISTORY_BUCKET = "EVENTUAL_EXECUTION_HISTORY_BUCKET";
  export const EVENT_BUS_ARN = "EVENTUAL_EVENT_BUS_ARN";
  export const WORKFLOW_QUEUE_URL = "EVENTUAL_WORKFLOW_QUEUE_URL";
  export const WORKFLOW_QUEUE_ARN = "EVENTUAL_WORKFLOW_QUEUE_ARN";
  export const WORKFLOW_FUNCTION_NAME = "EVENTUAL_WORKFLOW_FUNCTION_NAME";
  export const ACTIVITY_WORKER_FUNCTION_NAME =
    "EVENTUAL_ACTIVITY_WORKER_FUNCTION_NAME";
  export const ACTIVITY_TABLE_NAME = "EVENTUAL_ACTIVITY_TABLE_NAME";
  export const SCHEDULER_ROLE_ARN = "EVENTUAL_SCHEDULER_ROLE_ARN";
  export const SCHEDULER_DLQ_ROLE_ARN = "EVENTUAL_SCHEDULER_DLQ_ROLE_ARN";
  export const SCHEDULER_GROUP = "EVENTUAL_SCHEDULER_GROUP";
  export const TIMER_QUEUE_URL = "EVENTUAL_TIMER_QUEUE_URL";
  export const TIMER_QUEUE_ARN = "EVENTUAL_TIMER_QUEUE_ARN";
  export const SCHEDULE_FORWARDER_ARN = "EVENTUAL_SCHEDULE_FORWARDER_ARN";
  export const TELEMETRY_LOG_GROUP_NAME = "EVENTUAL_TELEMETRY_LOG_GROUP_NAME";
}

export function tryGetEnv(name: string) {
  return assertNonNull(
    process.env[name],
    `Expected env variable ${name} to be present.`
  );
}

export const workflowFunctionName = () =>
  tryGetEnv(ENV_NAMES.WORKFLOW_FUNCTION_NAME);
export const serviceName = () => tryGetEnv(ENV_NAMES.SERVICE_NAME);
export const tableName = () => tryGetEnv(ENV_NAMES.TABLE_NAME);
export const eventBusArn = () => tryGetEnv(ENV_NAMES.EVENT_BUS_ARN);
export const executionHistoryBucket = () =>
  tryGetEnv(ENV_NAMES.EXECUTION_HISTORY_BUCKET);
export const workflowQueueUrl = () => tryGetEnv(ENV_NAMES.WORKFLOW_QUEUE_URL);
export const workflowQueueArn = () => tryGetEnv(ENV_NAMES.WORKFLOW_QUEUE_ARN);
export const activityWorkerFunctionName = () =>
  tryGetEnv(ENV_NAMES.ACTIVITY_WORKER_FUNCTION_NAME);
export const activityTableName = () => tryGetEnv(ENV_NAMES.ACTIVITY_TABLE_NAME);
export const schedulerRoleArn = () => tryGetEnv(ENV_NAMES.SCHEDULER_ROLE_ARN);
export const schedulerDlqArn = () =>
  tryGetEnv(ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN);
export const schedulerGroup = () => tryGetEnv(ENV_NAMES.SCHEDULER_GROUP);
export const timerQueueArn = () => tryGetEnv(ENV_NAMES.TIMER_QUEUE_ARN);
export const timerQueueUrl = () => tryGetEnv(ENV_NAMES.TIMER_QUEUE_URL);
export const schedulerForwarderArn = () =>
  tryGetEnv(ENV_NAMES.SCHEDULE_FORWARDER_ARN);
export const telemetryLogGroupName = () =>
  tryGetEnv(ENV_NAMES.TELEMETRY_LOG_GROUP_NAME);
