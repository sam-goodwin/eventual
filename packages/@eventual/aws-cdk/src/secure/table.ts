import {
  BillingMode,
  StreamViewType,
  Table,
  TableEncryption,
  TableProps,
} from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { type Compliance } from "../compliance";

export interface SecureTableProps extends TableProps {
  compliancePolicy: Compliance;
}

export class SecureTable extends Table {
  constructor(
    scope: Construct,
    id: string,
    { compliancePolicy, ...props }: SecureTableProps
  ) {
    super(scope, id, {
      billingMode: BillingMode.PAY_PER_REQUEST, // Or adjust as needed
      encryption: compliancePolicy.isAWSOwnedKeys()
        ? TableEncryption.DEFAULT
        : compliancePolicy.isAWSManagedKeys()
        ? TableEncryption.AWS_MANAGED
        : TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: compliancePolicy.isCustomerManagedKeys()
        ? compliancePolicy.dataEncryptionKey
        : undefined,
      pointInTimeRecovery: true, // Ensure data recovery
      stream: StreamViewType.NEW_AND_OLD_IMAGES, // For keeping track of all changes
      ...props,
    });
  }
}
