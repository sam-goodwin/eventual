import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest as AwsHttpRequest } from "@aws-sdk/protocol-http";
import { parseQueryString } from "@aws-sdk/querystring-parser";
import { SignatureV4, SignatureV4Init } from "@aws-sdk/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import {
  BeforeRequest,
  HttpMethod,
  HttpServiceClient,
  HttpServiceClientProps,
} from "@eventual/client";
import {
  NODE_REGION_CONFIG_FILE_OPTIONS,
  NODE_REGION_CONFIG_OPTIONS,
} from "@aws-sdk/config-resolver";
import { loadConfig } from "@aws-sdk/node-config-provider";
import { ApiRequest } from "@eventual/core";

export interface AwsHttpServiceClientProps extends HttpServiceClientProps {
  credentials?: SignatureV4Init["credentials"];
  region?: string;
  /**
   * Optional hook to mutate the request before the request is signed.
   *
   * `beforeRequest` is invoked after signing the request and may invalidate the signature.
   */
  beforeRequestSigning?: BeforeRequest;
}

/**
 * AWS specific Http implementation of the {@link EventualServiceClient} to hit the API deployed
 * with an eventual service.
 *
 * Makes authorized and signed requests to API Gateway using the credentials provided on construction.
 */
export class AwsHttpServiceClient extends HttpServiceClient {
  constructor(props: AwsHttpServiceClientProps) {
    const signRequest: BeforeRequest = async (request) => {
      const updatedRequest = props.beforeRequestSigning
        ? await props.beforeRequestSigning(request)
        : request;

      const url = new URL(updatedRequest.url);

      const _headers: [string, string][] = [["host", url.hostname]];
      // workaround because Headers.entries() is not available in node-fetch
      new Headers(updatedRequest!.headers).forEach((value, key) =>
        _headers.push([key, value])
      );

      const _request = new AwsHttpRequest({
        hostname: url.hostname,
        path: url.pathname,
        body: updatedRequest.body ? updatedRequest.body : undefined,
        method: updatedRequest.method.toUpperCase(),
        headers: Object.fromEntries(_headers),
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

      const authorizedRequest = new ApiRequest(url.href, {
        method: method as HttpMethod,
        body,
        headers,
      });

      return props.beforeRequest
        ? await props.beforeRequest(authorizedRequest)
        : authorizedRequest;
    };

    super({ ...props, beforeRequest: signRequest });
  }
}

export async function resolveRegion() {
  return await loadConfig(
    NODE_REGION_CONFIG_OPTIONS,
    NODE_REGION_CONFIG_FILE_OPTIONS
  )();
}
