import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  BucketProps,
} from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import type { Compliance } from "../compliance";

export interface SecureBucketProps extends BucketProps {
  compliancePolicy: Compliance;
}

export class SecureBucket extends Bucket {
  constructor(
    scope: Construct,
    id: string,
    { compliancePolicy, ...props }: SecureBucketProps
  ) {
    super(scope, id, {
      enforceSSL: compliancePolicy.isSSLRequired,
      encryption: compliancePolicy.isAWSOwnedKeys()
        ? BucketEncryption.S3_MANAGED
        : compliancePolicy.isAWSManagedKeys()
        ? BucketEncryption.KMS_MANAGED
        : BucketEncryption.KMS,
      encryptionKey: compliancePolicy.isCustomerManagedKeys()
        ? compliancePolicy.dataEncryptionKey
        : undefined,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      // TODO: what is the right value here?
      // versioned: true,
      publicReadAccess: false,
      // TODO: is this needed for cloud trail?
      serverAccessLogsBucket: undefined,
      serverAccessLogsPrefix: undefined,
      ...props,
    });
  }
}
