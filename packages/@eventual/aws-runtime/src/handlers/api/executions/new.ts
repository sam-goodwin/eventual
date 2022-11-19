import { APIGatewayProxyEventV2 } from "aws-lambda";
import { workflows } from "../env";
import { createWorkflowClient } from "../../../clients/create";

/**
 * Create a new execution (start a workflow)
 * @param event
 * @returns
 */
export async function handler(event: APIGatewayProxyEventV2) {
  const name = event.pathParameters?.name;
  if (!name) {
    return { statusCode: 400, body: `Missing workflow name` };
  }
  const workflow = workflows[name];
  if (!workflow) {
    return {
      statusCode: 400,
      body: `Workflow ${name} does not exist!`,
    };
  }
  const workflowClient = createWorkflowClient(workflow);

  return {
    executionId: await workflowClient.startWorkflow({ input: event.body }),
  };
}