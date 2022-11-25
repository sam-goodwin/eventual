import { getHooks, registerWorkflowClient } from "@eventual/core";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import itty from "itty-router";
import { createWorkflowClient } from "src/clients";

// TODO: remove once we can upgrade to Node 18
import "./fetch-polyfill";

// make the workflow client available to web hooks
registerWorkflowClient(createWorkflowClient());

// initialize all web hooks onto the central HTTP router
const router = itty.Router<itty.Request, itty.IHTTPMethods>({});

getHooks().forEach((hook) => {
  console.log("registering hook", hook.toString());
  hook(router);
});

router.all("*", () => new Response("Not Found.", { status: 404 }));

/**
 * Handle inbound webhook API requests.
 *
 * Each webhook registers routes on the central {@link router} which
 * then handles the request.
 */
export async function processWebhook(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const request: itty.Request = {
    method: event.requestContext.http.method,
    url: `http://localhost:3000${event.requestContext.http.path}`,
    params: event.pathParameters as itty.Obj,
    query: event.queryStringParameters as itty.Obj,
  };
  console.log(request);
  const response: Response = await router.handle(request);
  console.log(response);

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => (headers[key] = value));
  return {
    headers,
    statusCode: response.status,
    body: Buffer.from(await response.arrayBuffer()).toString("base64"),
    isBase64Encoded: true,
  };
}
