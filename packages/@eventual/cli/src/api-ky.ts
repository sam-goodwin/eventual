import * as sig from "@aws-sdk/signature-v4";
import ky from "ky-universal";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { parseQueryString } from "@aws-sdk/querystring-parser";
import { Sha256 } from "@aws-crypto/sha256-js";
import type { KyInstance } from "./types.js";
import { loadConfig } from "@aws-sdk/node-config-provider";
import {
  NODE_REGION_CONFIG_OPTIONS,
  NODE_REGION_CONFIG_FILE_OPTIONS,
} from "@aws-sdk/config-resolver";
import { getServiceData } from "./service-data.js";
import { assumeCliRole } from "./role.js";
import { AwsCredentialIdentity } from "@aws-sdk/types";

//Return a ky which signs our requests with our execute role. Code adapted from
// https://github.com/zirkelc/aws-sigv4-fetch
export async function apiKy(
  service: string,
  region?: string
): Promise<KyInstance> {
  const resolvedRegion =
    region ??
    (await loadConfig(
      NODE_REGION_CONFIG_OPTIONS,
      NODE_REGION_CONFIG_FILE_OPTIONS
    )());
  const credentials = await assumeCliRole(service, resolvedRegion);
  return ky.extend({
    prefixUrl: `${
      (await getServiceData(credentials, service, region)).apiEndpoint
    }/_eventual`,
    hooks: {
      beforeRequest: [
        async (req: Request) => {
          const signer = await getSigner(credentials, resolvedRegion);
          const url = new URL(req.url);
          const headers = new Map<string, string>();
          // workaround because Headers.entries() is not available in cross-fetch
          req.headers.forEach((value, key) => headers.set(key, value));
          // host is required by AWS Signature V4: https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html
          headers.set("host", url.host);

          //We're cloning the request before reading the body since
          //node-fetch copies an internal flag marking the body as consumed
          //into our returned request, making it unreadable
          //So we use a clone to make sure we don't trip that flag on our request to be copied
          //Can remove this once we target node 18 minimum and no longer need node-fetch
          const body = await req.clone().text();
          const request = new HttpRequest({
            hostname: url.hostname,
            path: url.pathname,
            protocol: url.protocol,
            method: req.method.toUpperCase(),
            body: body.length ? body : undefined,
            query: parseQueryString(url.search),
            headers: Object.fromEntries(headers.entries()),
          });
          const signedRequest = (await signer.sign(request)) as HttpRequest;
          return new Request(req, {
            headers: new Headers(signedRequest.headers),
            body: signedRequest.body,
          });
        },
      ],
    },
  });
}

async function getSigner(credentials: AwsCredentialIdentity, region?: string) {
  return new sig.SignatureV4({
    credentials,
    service: "execute-api",
    region: region ?? "us-east-1",
    sha256: Sha256,
  });
}
