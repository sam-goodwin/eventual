import "@eventual/entry/injected";

import { ApiRequest } from "@eventual/core";
import { createApiHandler } from "@eventual/runtime-core";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { Buffer } from "buffer";
import { createEventClient, createServiceClient } from "../create.js";

const processRequest = createApiHandler({
  // partially uses the runtime clients and partially uses the http client
  serviceClient: createServiceClient({
    eventClient: createEventClient(),
  }),
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
  const requestBody = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : event.body
    : undefined;

  const request = new ApiRequest(
    `https://${event.requestContext.domainName}${event.rawPath}?${event.rawQueryString}`,
    {
      // TODO: get protocol from header 'x-forwarded-proto'?
      body: requestBody,
      headers: event.headers as Record<string, string>,
      method: event.requestContext.http.method,
    }
  );

  const response = await processRequest(request);
  let headers: Record<string, string>;
  response.body;

  if (typeof response.headers?.forEach === "function") {
    headers = {};
    // handle node fetch API
    response.headers.forEach((value, key) => (headers[key] = value));
  } else {
    headers = (response.headers as Record<string, string>) ?? {};
  }

  let responseBody: Buffer;
  if (typeof response.body === "string") {
    responseBody = Buffer.from(response.body, "utf-8");
  } else if (Buffer.isBuffer(response.body)) {
    responseBody = response.body;
  } else if (typeof response.arrayBuffer === "function") {
    responseBody = Buffer.from(await response.arrayBuffer());
  } else if (typeof response.text === "function") {
    responseBody = Buffer.from(await response.text(), "utf-8");
  } else {
    throw new Error(`Unrecognized body type: ${typeof response.body}`);
  }
  return {
    headers,
    statusCode: response.status,
    body: responseBody.toString("base64"),
    isBase64Encoded: true,
  };
}
