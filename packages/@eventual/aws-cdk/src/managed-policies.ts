import { ManagedPolicy, type ManagedPolicyProps } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import type { ServiceConstructProps } from "./service-common";
import { Stack } from "aws-cdk-lib/core";

/**
 * Standardizes how Managed Policies are created and maintained within each Service, e.g. CommandService, BucketService, etc.
 */
export class ManagedPolicies extends Construct {
  constructor(
    scope: Construct,
    id: string,
    private readonly props: ServiceConstructProps
  ) {
    super(scope, id);
  }

  public createManagedPolicy(name: string, options?: ManagedPolicyProps) {
    return new ManagedPolicy(this, name, {
      managedPolicyName: `${this.props.serviceName}-${name}-${
        Stack.of(this).region
      }`,
      ...(options ?? {}),
    });
  }
}
