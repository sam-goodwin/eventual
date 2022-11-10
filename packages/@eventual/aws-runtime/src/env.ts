export namespace ENV_NAMES {
  export const TABLE_NAME = "TABLE_NAME";
  export const EXECUTION_HISTORY_BUCKET = "EXECUTION_HISTORY_BUCKET";
  export const WORKFLOW_QUEUE_URL = "WORKFLOW_QUEUE_URL";
  export const WORKFLOW_FUNCTION_NAME = "WORKFLOW_FUNCTION_NAME";
}

export const workflowFunctionName =
  process.env[ENV_NAMES.WORKFLOW_FUNCTION_NAME];
export const tableName = process.env[ENV_NAMES.TABLE_NAME];
export const executionHistoryBucket =
  process.env[ENV_NAMES.EXECUTION_HISTORY_BUCKET];
export const workflowQueueUrl = process.env[ENV_NAMES.WORKFLOW_QUEUE_URL];
