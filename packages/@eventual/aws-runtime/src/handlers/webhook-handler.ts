import { createWebhookProcessor } from "@eventual/core";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import itty from "itty-router";
import { createWorkflowClient } from "../clients/create.js";

// TODO: remove once we can upgrade to Node 18 in AWS Lambda
import "./fetch-polyfill";

const processWebhookRequest = createWebhookProcessor(createWorkflowClient());

/**
 * Handle inbound webhook API requests.
 *
 * Each webhook registers routes on the central router that
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
    async json() {
      if (event.body) {
        return JSON.parse(event.body!);
      } else {
        return undefined;
      }
    },
  };
  const response = await processWebhookRequest(request);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => (headers[key] = value));
  return {
    headers,
    statusCode: response.status,
    body: Buffer.from(await response.arrayBuffer()).toString("base64"),
    isBase64Encoded: true,
  };
}
