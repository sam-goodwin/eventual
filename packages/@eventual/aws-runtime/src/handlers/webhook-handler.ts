import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { getHooks } from "@eventual/core";
import itty from "itty-router";
import { createWorkflowClient } from "src/clients";

const router = itty.Router<itty.Request, itty.IHTTPMethods>({});

getHooks().forEach((hook) => hook(router));

// TODO: plu
const workflowClient = createWorkflowClient();

export async function handle(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const response: Response = await router.handle({
    method: event.requestContext.http.method,
    // TODO: is this right?
    url: event.requestContext.http.path,
    params: event.pathParameters as itty.Obj,
    query: event.queryStringParameters as itty.Obj,
  });

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => (headers[key] = value));
  return {
    headers,
    statusCode: response.status,
    body: Buffer.from(await response.arrayBuffer()).toString("base64"),
    isBase64Encoded: true,
  };
}
