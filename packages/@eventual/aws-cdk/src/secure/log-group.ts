import { LogGroup, LogGroupProps } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { Compliance } from "../compliance";

export interface SecureLogGroupProps extends LogGroupProps {
  compliancePolicy: Compliance;
}

export class SecureLogGroup extends LogGroup {
  constructor(
    scope: Construct,
    id: string,
    { compliancePolicy, ...props }: SecureLogGroupProps
  ) {
    super(scope, id, {
      encryptionKey: compliancePolicy.logEncryptionKey,

      // TODO: retention?
      // retention: undefined,

      // TODO: configure data protection policy to scan for PII and report findings to CloudTrail
      // dataProtectionPolicy: new DataProtectionPolicy({
      //   name,
      //   description,
      //   identifiers,
      //   logGroupAuditDestination,
      //   s3BucketAuditDestination,
      //   deliveryStreamNameAuditDestination,
      // }),
      ...props,
    });
  }
}
