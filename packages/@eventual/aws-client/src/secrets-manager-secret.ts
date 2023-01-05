import { BaseCachingSecret, CachingConfig, Secret } from "@eventual/core";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

let _defaultClient: SecretsManagerClient;

export interface AWSSecretProps {
  /**
   * The ID of the AWS Secrets Manager that contains the secret
   */
  secretId: string;
  /**
   * The {@link SecretsManagerClient} to use for interacting with the AWS Secrets Manager API.
   *
   * @default - a client is created
   */
  client?: SecretsManagerClient;
  /**
   * Configuration to control the caching
   * @default - permanent caching
   */
  cacheConfig?: CachingConfig;
}

/**
 * A {@link Secret} stored in an AWS Secrets Manager Secret.
 */
export class AWSSecret
  extends BaseCachingSecret<string>
  implements Secret<string>
{
  /**
   * The ID of the AWS Secrets Manager that contains the secret
   */
  private readonly secretId: string;
  /**
   * The {@link SecretsManagerClient} to use for interacting with the AWS Secrets Manager API.
   */
  private readonly client: SecretsManagerClient;

  constructor(props: AWSSecretProps) {
    super(props.cacheConfig);
    this.secretId = props.secretId;
    this.client =
      props.client ?? (_defaultClient ??= new SecretsManagerClient({}));
  }

  /**
   * Get the Secret string from the AWS Secrets Manager client.
   *
   * @returns the Secret string if it exists and is a String, otherwise throws an error
   */
  protected async getFreshSecret(): Promise<string> {
    const response = await this.client.send(
      new GetSecretValueCommand({
        SecretId: this.secretId,
      })
    );

    if (typeof response.SecretString === "string") {
      return response.SecretString;
    } else {
      throw new Error(
        `expected a SecretString stored in the AWS Secret with ID: '${this.secretId}'`
      );
    }
  }
}
