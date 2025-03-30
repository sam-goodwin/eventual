import { Queue, QueueEncryption, QueueProps } from "aws-cdk-lib/aws-sqs";
import { Duration } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import type { Compliance } from "../compliance.js";

export interface SecureQueueProps extends QueueProps {
  compliancePolicy: Compliance;
}

export class SecureQueue extends Queue {
  constructor(
    scope: Construct,
    id: string,
    { compliancePolicy, ...props }: SecureQueueProps
  ) {
    super(scope, id, {
      enforceSSL: compliancePolicy.isSSLRequired,
      encryption: compliancePolicy.isAWSOwnedKeys()
        ? QueueEncryption.SQS_MANAGED
        : compliancePolicy.isAWSManagedKeys()
        ? QueueEncryption.KMS_MANAGED
        : QueueEncryption.KMS,
      encryptionMasterKey: compliancePolicy.isCustomerManagedKeys()
        ? compliancePolicy.dataEncryptionKey
        : undefined,
      // set to maximum so we always have time to respond
      retentionPeriod: Duration.days(14),
      ...props,
    });
  }
}
