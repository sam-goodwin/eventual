import { assertNonNull } from "@eventual/core";

export namespace ENV_NAMES {
  export const TABLE_NAME = "TABLE_NAME";
  export const EXECUTION_HISTORY_BUCKET = "EXECUTION_HISTORY_BUCKET";
  export const WORKFLOW_QUEUE_URL = "WORKFLOW_QUEUE_URL";
  export const WORKFLOW_FUNCTION_NAME = "WORKFLOW_FUNCTION_NAME";
  export const ACTION_WORKER_FUNCTION_NAME = "ACTION_WORKER_FUNCTION_NAME";
  export const ACTIVITY_LOCK_TABLE_NAME = "ACTIVITY_LOCK_TABLE_NAME";
}

export function tryGetEnv(name: string) {
  return assertNonNull(
    process.env[name],
    `Expected env variable ${name} to be present.`
  );
}

export const workflowFunctionName = () =>
  tryGetEnv(ENV_NAMES.WORKFLOW_FUNCTION_NAME);
export const tableName = () => tryGetEnv(ENV_NAMES.TABLE_NAME);
export const executionHistoryBucket = () =>
  tryGetEnv(ENV_NAMES.EXECUTION_HISTORY_BUCKET);
export const workflowQueueUrl = () => tryGetEnv(ENV_NAMES.WORKFLOW_QUEUE_URL);
export const actionWorkerFunctionName = () =>
  tryGetEnv(ENV_NAMES.ACTION_WORKER_FUNCTION_NAME);
export const activityLockTableName = () =>
  tryGetEnv(ENV_NAMES.ACTIVITY_LOCK_TABLE_NAME);
