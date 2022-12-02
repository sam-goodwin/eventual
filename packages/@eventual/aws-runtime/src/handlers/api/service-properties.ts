export const getService = () =>
  JSON.parse(process.env.SERVICE!) as ServiceProperties;

export interface ServiceProperties {
  name: string;
  tableName: string;
  workflowQueueUrl: string;
  executionHistoryBucket: string;
  orchestratorFunctionName: string;
  activityWorkerFunctionName: string;
}
