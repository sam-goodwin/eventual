import { APIGatewayProxyEventV2 } from "aws-lambda";
import { createWorkflowRuntimeClient } from "../../../../clients";
import { workflows } from "../../env";

export async function handler(event: APIGatewayProxyEventV2) {
  const workflowName = event.pathParameters?.name;
  if (!workflowName) {
    return { statusCode: 400, body: `Missing workflowName` };
  }
  const executionId = event.pathParameters?.executionId;
  if (!executionId) {
    return { statusCode: 400, body: `Missing executionId` };
  }
  const workflow = workflows[workflowName];
  if (!workflow) {
    return {
      statusCode: 400,
      body: `Workflow ${workflowName} does not exist!`,
    };
  }

  const workflowClient = createWorkflowRuntimeClient(workflow);
  console.log(executionId);
  const history = await workflowClient.getHistory(executionId);
  return history;
}
