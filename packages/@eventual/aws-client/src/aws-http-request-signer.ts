import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { HttpRequest as AwsHttpRequest } from "@aws-sdk/protocol-http";
import { parseQueryString } from "@aws-sdk/querystring-parser";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { BeforeRequest, HttpRequest } from "@eventual/client";
import { AWSHttpEventualClientProps } from "./aws-http-eventual-client.js";
import { resolveRegion } from "./resolve-aws-region.js";

export function createAwsHttpRequestSigner(
  props: Omit<AWSHttpEventualClientProps, "serviceUrl">
): BeforeRequest {
  return async (request) => {
    const updatedRequest = props.beforeRequestSigning
      ? await props.beforeRequestSigning(request)
      : request;

    const url = new URL(updatedRequest.url);

    const _headers: any = { ...updatedRequest.headers, host: url.hostname };

    const _request = new AwsHttpRequest({
      hostname: url.hostname,
      path: url.pathname,
      body: updatedRequest.body ? updatedRequest.body : undefined,
      method: updatedRequest.method.toUpperCase(),
      headers: _headers,
      protocol: url.protocol,
      query: parseQueryString(url.search),
    });

    // create a signer object with the credentials, the service name and the region
    const signer = new SignatureV4({
      credentials: props.credentials ?? defaultProvider(),
      service: "execute-api",
      region: props.region ?? (await resolveRegion()),
      sha256: Sha256,
    });

    // sign the request and extract the signed headers, body and method
    const { headers, body, method } = await signer.sign(_request);

    const authorizedRequest: HttpRequest = {
      url: url.href,
      body,
      headers,
      method,
    };

    return props.beforeRequest
      ? await props.beforeRequest(authorizedRequest)
      : authorizedRequest;
  };
}
