import * as sts from "@aws-sdk/client-sts";
import * as iam from "@aws-sdk/client-iam";
import * as sig from "@aws-sdk/signature-v4";
import * as cfn from "@aws-sdk/client-cloudformation";
import ky from "ky-universal";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { parseQueryString } from "@aws-sdk/querystring-parser";
import { Sha256 } from "@aws-crypto/sha256-js";
import { styledConsole } from "./styled-console.js";
import type { KyInstance } from "./types.js";
import { loadConfig } from "@aws-sdk/node-config-provider";
import {
  NODE_REGION_CONFIG_OPTIONS,
  NODE_REGION_CONFIG_FILE_OPTIONS,
} from "@aws-sdk/config-resolver";

//Return a ky which signs our requests with our execute role. Code adapted from
// https://github.com/zirkelc/aws-sigv4-fetch
export async function apiKy(region?: string): Promise<KyInstance> {
  const resolvedRegion =
    region ??
    (await loadConfig(
      NODE_REGION_CONFIG_OPTIONS,
      NODE_REGION_CONFIG_FILE_OPTIONS
    )());
  const roleArn = await getApiRoleArn(resolvedRegion);
  return ky.extend({
    prefixUrl: await getApiUrl(resolvedRegion),
    hooks: {
      beforeRequest: [
        async (req: Request) => {
          const signer = await getSigner(roleArn, resolvedRegion);
          const url = new URL(req.url);
          const headers = new Map<string, string>();
          // workaround because Headers.entries() is not available in cross-fetch
          req.headers.forEach((value, key) => headers.set(key, value));
          // host is required by AWS Signature V4: https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html
          headers.set("host", url.host);

          const request = new HttpRequest({
            hostname: url.hostname,
            path: url.pathname,
            protocol: url.protocol,
            method: req.method.toUpperCase(),
            body: (await req.body?.getReader().read())?.value,
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

async function getApiUrl(region?: string) {
  const cfnClient = new cfn.CloudFormationClient({ region });
  const { Exports } = await cfnClient.send(new cfn.ListExportsCommand({}));
  const apiUrl = Exports?.find((v) => v.Name === "eventual-api-url")?.Value;
  if (!apiUrl) {
    styledConsole.error(
      "No eventual-api-url cloudformation export! Have you deployed an Eventual Api?"
    );
    throw new Error("No api url");
  }
  return apiUrl;
}

export async function getApiRoleArn(region?: string): Promise<string> {
  const iamClient = new iam.IAMClient({ region });
  const apiRole = await iamClient.send(
    new iam.GetRoleCommand({ RoleName: "eventual-api" })
  );
  if (!apiRole.Role) {
    styledConsole.error(
      "Couldn't find eventual-api role! Have you deployed an eventual api?"
    );
    process.exit(1);
  }
  return apiRole.Role.Arn!;
}

async function getSigner(roleArn: string, region?: string) {
  const stsClient = new sts.STSClient({ region });
  const session = await stsClient.send(
    new sts.AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: "eventual-cli",
    })
  );

  return new sig.SignatureV4({
    credentials: {
      accessKeyId: session.Credentials!.AccessKeyId!,
      secretAccessKey: session.Credentials!.SecretAccessKey!,
      sessionToken: session.Credentials!.SessionToken,
    },
    service: "execute-api",
    region: region ?? "us-east-1",
    sha256: Sha256,
  });
}