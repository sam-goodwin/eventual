import * as sts from "@aws-sdk/client-sts";
import * as iam from "@aws-sdk/client-iam";
import * as sig from "@aws-sdk/signature-v4";
import * as cfn from "@aws-sdk/client-cloudformation";
import ky from "ky-universal";
import type { KyInstance } from "ky/distribution/types/ky";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { parseQueryString } from "@aws-sdk/querystring-parser";
import { Sha256 } from "@aws-crypto/sha256-js";
import { styledConsole } from "./styled-console";

const iamClient = new iam.IAMClient({});
const stsClient = new sts.STSClient({});
const cfnClient = new cfn.CloudFormationClient({});

//Return a ky which signs our requests with our execute role. Code adapted from
// https://github.com/zirkelc/aws-sigv4-fetch
export async function apiKy(): Promise<KyInstance> {
  const apiRole = await iamClient.send(
    new iam.GetRoleCommand({ RoleName: "eventual-api" })
  );
  if (!apiRole.Role) {
    styledConsole.error(
      "Couldn't find eventual-api role! Have you deployed an eventual api?"
    );
    process.exit(1);
  }
  const session = await stsClient.send(
    new sts.AssumeRoleCommand({
      RoleArn: apiRole.Role.Arn,
      RoleSessionName: "eventual-cli",
    })
  );
  const signer = new sig.SignatureV4({
    credentials: {
      accessKeyId: session.Credentials!.AccessKeyId!,
      secretAccessKey: session.Credentials!.SecretAccessKey!,
      sessionToken: session.Credentials!.SessionToken,
    },
    service: "execute-api",
    //TODO is there a way to derive the region?
    region: "us-east-1",
    sha256: Sha256,
  });

  const { Exports } = await cfnClient.send(new cfn.ListExportsCommand({}));
  const apiUrl = Exports?.find((v) => v.Name === "eventual-api-url")?.Value;
  if (!apiUrl) {
    styledConsole.error(
      "No eventual-api-url cloudformation export! Have you deployed an Eventual Api?"
    );
    process.exit(1);
  }

  return ky.extend({
    prefixUrl: apiUrl,
    hooks: {
      beforeRequest: [
        async (req: Request) => {
          const url = new URL(req.url);
          const headers = new Map<string, string>();
          // workaround because Headers.entries() is not available in cross-fetch
          new Headers(req.headers).forEach((value, key) =>
            headers.set(key, value)
          );
          // host is required by AWS Signature V4: https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html
          headers.set("host", url.host);

          const request = new HttpRequest({
            hostname: url.hostname,
            path: url.pathname,
            protocol: url.protocol,
            method: req.method.toUpperCase(),
            body: req.body,
            query: parseQueryString(url.search),
            headers: Object.fromEntries(headers.entries()),
          });
          const signedRequest = (await signer.sign(request)) as HttpRequest;
          return {
            ...req,
            headers: new Headers(signedRequest.headers),
            body: signedRequest.body,
          };
        },
      ],
    },
  });
}
