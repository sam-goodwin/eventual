import { getHooks, registerWorkflowClient } from "@eventual/core";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import itty from "itty-router";
import { createWorkflowClient } from "src/clients";

// make the workflow client available to web hooks
registerWorkflowClient(createWorkflowClient());

// initialize all web hooks onto the central HTTP router
const router = itty.Router<itty.Request, itty.IHTTPMethods>({});
getHooks().forEach((hook) => hook(router));

/**
 * Handle inbound webhook API requests.
 *
 * Each webhook registers routes on the central {@link router} which
 * then handles the request.
 */
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
