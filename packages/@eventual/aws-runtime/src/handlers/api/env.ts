export const workflows = JSON.parse(process.env.WORKFLOWS!) as Record<
  string,
  WorkflowProperties
>;

export interface WorkflowProperties {
  name: string;
  tableName: string;
  workflowQueueUrl: string;
  executionHistoryBucket: string;
  orchestratorFunctionName: string;
  activityWorkerFunctionName: string;
}
