import { APIGatewayProxyEventV2 } from "aws-lambda";
import { workflows } from "../env";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient({});

export async function handler(event: APIGatewayProxyEventV2) {
  const workflowName = event.pathParameters?.name;
  if (!workflowName) {
    return { statusCode: 400, body: `Missing workflowName` };
  }
  await lambdaClient.send(
    new InvokeCommand({ FunctionName: workflows[workflowName] })
  );
  return {
    executionId: "id here",
  };
}
