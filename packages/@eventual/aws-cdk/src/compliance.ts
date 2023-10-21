import { IBucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { SecureKey } from "./secure/key";

export enum ComplianceStandard {
  HIPAA = "HIPAA",
}

export interface CompliancePolicyProps {
  /**
   * A list of {@link ComplianceStandard}s that this Service must comply with.
   */
  standards?: ComplianceStandard[];
  /**
   * The Landing Zone's Audit Bucket.
   *
   * TODO: implement this
   *
   * @see https://docs.aws.amazon.com/controltower/latest/userguide/planning-your-deployment.html
   */
  auditBucket?: IBucket;
  /**
   * The Landing Zone's Logging Bucket.
   *
   * * TODO: implement this
   *
   * @see https://docs.aws.amazon.com/controltower/latest/userguide/planning-your-deployment.html
   */
  loggingBucket?: IBucket;
}

export enum EncryptionKeyOwnership {
  CUSTOMER_OWNED = "CUSTOMER_OWNED",
  AWS_MANAGED = "AWS_MANAGED",
  AWS_OWNED = "AWS_OWNED",
}

/**
 * Centralized control of Security and Compliance features.
 *
 * E.g. KMS keys
 */
export class Compliance extends Construct {
  /**
   * A list of {@link ComplianceStandard}s that this Service must comply with.
   */
  public readonly standards: ComplianceStandard[];
  /**
   * A KMS Key for encrypting logs at test.
   */
  public readonly logEncryptionKey: SecureKey | undefined;
  /**
   * A KMS key for encrypting application data at rest.
   */
  public readonly dataEncryptionKey: SecureKey | undefined;

  constructor(scope: Construct, id: string, props?: CompliancePolicyProps) {
    super(scope, id);
    this.standards = props?.standards ?? [];

    if (this.encryptionKeyOwnership === EncryptionKeyOwnership.CUSTOMER_OWNED) {
      this.logEncryptionKey = new SecureKey(this, "LogEncryptionKey", {
        enableKeyRotation: true,
      });
      this.dataEncryptionKey = new SecureKey(this, "DataEncryptionKey", {
        enableKeyRotation: true,
      });
    }
  }

  /**
   * Does the compliant standards mandate that SSL is used when communicating with AWS resources.
   *
   * TODO: I can't think of a reason to not always enable this.
   */
  public get isSSLRequired(): boolean {
    return this.standards.includes(ComplianceStandard.HIPAA);
  }

  /**
   * The lowest level of security - AWS owns the keys and the customer has no visibility into them.
   */
  public isAWSOwnedKeys(): this is {
    dataEncryptionKey: undefined;
    logEncryptionKey: undefined;
  } {
    return this.encryptionKeyOwnership === EncryptionKeyOwnership.AWS_OWNED;
  }

  /**
   * The customer owns the keys but AWS manages their lifecycle.
   */
  public isAWSManagedKeys(): this is {
    dataEncryptionKey: undefined;
    logEncryptionKey: undefined;
  } {
    return this.encryptionKeyOwnership === EncryptionKeyOwnership.AWS_MANAGED;
  }

  /**
   * The customer owns the keys and manages their lifecycle.
   */
  public isCustomerManagedKeys(): this is {
    dataEncryptionKey: SecureKey;
    logEncryptionKey: SecureKey;
  } {
    return (
      this.encryptionKeyOwnership === EncryptionKeyOwnership.CUSTOMER_OWNED
    );
  }

  public get encryptionKeyOwnership(): EncryptionKeyOwnership {
    if (this.standards.includes(ComplianceStandard.HIPAA)) {
      // HIPAA requires the customer to have transparency into the key but AWS can manage its lifecycle
      // TODO: link to a reference
      return EncryptionKeyOwnership.AWS_MANAGED;
    }
    return EncryptionKeyOwnership.AWS_OWNED;
  }
}
