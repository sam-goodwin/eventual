import { APIGatewayProxyEventV2 } from "aws-lambda";

export async function handler(event: APIGatewayProxyEventV2) {
  const workflowName = event.pathParameters?.name;
  if (!workflowName) {
    return { statusCode: 400, body: `Missing workflowName` };
  }
  return { workflowName, status: "not implemented" };
}
