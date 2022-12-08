import * as sts from "@aws-sdk/client-sts";
import { AwsCredentialIdentity } from "@aws-sdk/types";

export async function assumeCliRole(
  service: string,
  region?: string
): Promise<AwsCredentialIdentity> {
  const stsClient = new sts.STSClient({ region });
  const identity = await stsClient.send(new sts.GetCallerIdentityCommand({}));
  const roleArn = `arn:aws:iam::${identity.Account}:role/eventual-cli-${service}`;
  const { Credentials } = await stsClient.send(
    new sts.AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: "eventual-cli",
    })
  );
  return {
    accessKeyId: Credentials!.AccessKeyId!,
    secretAccessKey: Credentials!.SecretAccessKey!,
    sessionToken: Credentials!.SessionToken,
  };
}
