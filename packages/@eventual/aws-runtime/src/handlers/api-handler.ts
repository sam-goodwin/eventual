import "@eventual/entry/injected";

import { createApiHandler } from "@eventual/core";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { createServiceClient } from "../clients/create.js";

// TODO: remove once we can upgrade to Node 18 in AWS Lambda
import "./fetch-polyfill.js";

const processRequest = createApiHandler({
  serviceClient: createServiceClient(),
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
  console.debug("event", event);
  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : event.body
    : undefined;

  const request = new Request(
    // TODO: get protocol from header 'x-forwarded-proto'?
    new URL(
      `https://${event.requestContext.domainName}${event.rawPath}?${event.rawQueryString}`
    ),
    {
      body,
      headers: event.headers as Record<string, string>,
      method: event.requestContext.http.method,
    }
  );

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
