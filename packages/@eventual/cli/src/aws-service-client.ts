import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { parseQueryString } from "@aws-sdk/querystring-parser";
import { SignatureV4, SignatureV4Init } from "@aws-sdk/signature-v4";
import {
  BeforeRequest,
  HttpServiceClient,
  HttpServiceClientProps,
} from "@eventual/client";

export interface AwsHttpServiceClientProps extends HttpServiceClientProps {
  credentials: SignatureV4Init["credentials"];
  region: string;
}

export class AwsHttpServiceClient extends HttpServiceClient {
  constructor(props: AwsHttpServiceClientProps) {
    const signRequest: BeforeRequest = async (request: Request) => {
      const updatedRequest = props.beforeRequest
        ? await props.beforeRequest(request)
        : request;

      const url = new URL(updatedRequest.url);

      const _headers: [string, string][] = [["host", url.hostname]];
      // workaround because Headers.entries() is not available in cross-fetch
      new Headers(updatedRequest!.headers).forEach((value, key) =>
        _headers.push([key, value])
      );

      const _request = new HttpRequest({
        hostname: url.hostname,
        path: url.pathname,
        body: updatedRequest.body ? await updatedRequest.text() : undefined,
        method: updatedRequest.method.toUpperCase(),
        headers: Object.fromEntries(_headers),
        protocol: url.protocol,
        query: parseQueryString(url.search),
      });

      // create a signer object with the credentials, the service name and the region
      const signer = new SignatureV4({
        credentials: props.credentials,
        service: "execute-api",
        region: props.region,
        sha256: Sha256,
      });

      // sign the request and extract the signed headers, body and method
      const { headers, body, method } = await signer.sign(_request);

      return new Request(url, {
        headers: new Headers(headers),
        body,
        method,
      });
    };

    super({ ...props, beforeRequest: signRequest });
  }
}
