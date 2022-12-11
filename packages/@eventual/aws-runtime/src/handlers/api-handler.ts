import "@eventual/entry/injected";

import { ApiRequest, createApiHandler } from "@eventual/core";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import itty from "itty-router";
import { createEventClient, createWorkflowClient } from "../clients/create.js";

// TODO: remove once we can upgrade to Node 18 in AWS Lambda
import "./fetch-polyfill.js";

const processRequest = createApiHandler({
  workflowClient: createWorkflowClient(),
  eventClient: createEventClient(),
});

/**
 * Handle inbound webhook API requests.
 *
 * Each webhook registers routes on the central router that
 * then handles the request.
 */
export default async function (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : event.body
    : undefined;

  const request: ApiRequest = {
    method: event.requestContext.http.method,
    headers: event.headers,
    url: `http://localhost:3000${event.requestContext.http.path}`,
    params: event.pathParameters as itty.Obj,
    query: event.queryStringParameters as itty.Obj,
    async blob() {
      if (body === undefined) {
        return undefined;
      } else if (Buffer.isBuffer(body)) {
        return body;
      } else {
        return Buffer.from(body, "utf-8");
      }
    },
    async text() {
      if (body === undefined || typeof body === "string") {
        return body;
      } else {
        return body.toString("utf-8");
      }
    },
    async json() {
      if (body === undefined) {
        return undefined;
      } else if (typeof body === "string") {
        return JSON.parse(body);
      } else {
        return JSON.parse(body.toString("utf-8"));
      }
    },
  };
  const response = await processRequest(request);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => (headers[key] = value));
  return {
    headers,
    statusCode: response.status,
    body: Buffer.from(await response.arrayBuffer()).toString("base64"),
    isBase64Encoded: true,
  };
}
