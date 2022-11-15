import { APIGatewayProxyEventV2 } from "aws-lambda";
import { workflows } from "../env";
import { createWorkflowClient } from "../../../clients/create";

export async function handler(event: APIGatewayProxyEventV2) {
  const workflowName = event.pathParameters?.name;
  if (!workflowName) {
    return { statusCode: 400, body: `Missing workflowName` };
  }
  const workflow = workflows[workflowName];
  if (!workflow) {
    return {
      statusCode: 400,
      body: `Workflow ${workflowName} does not exist!`,
    };
  }
  const { tableName, workflowQueueUrl } = workflow;
  const workflowClient = createWorkflowClient({ tableName, workflowQueueUrl });

  return {
    executionId: await workflowClient.startWorkflow(workflowName, event.body),
  };
}
