import { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import type { Construct } from "constructs";
import type { Compliance } from "../compliance.js";
import { SecureLogGroup } from "./log-group.js";

export interface SecureFunctionProps extends FunctionProps {
  compliancePolicy: Compliance;
}

export class SecureFunction extends Function {
  constructor(scope: Construct, id: string, props: SecureFunctionProps) {
    super(scope, id, props);

    if (props.compliancePolicy.isCustomerManagedKeys()) {
      new SecureLogGroup(this, "LogGroup", {
        compliancePolicy: props.compliancePolicy,
        logGroupName: `/aws/lambda/${this.functionName}`,
      });
    }
  }
}
