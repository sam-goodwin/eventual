import { iam } from "@pulumi/aws";
import { Output, ResourceOptions } from "@pulumi/pulumi";
import type { input } from "@pulumi/aws/types";
import { IPrincipal } from "./grantable";

export interface RoleProps extends Omit<iam.RoleArgs, "inlinePolicies"> {
  inlinePolicies?: input.iam.RoleInlinePolicy[];
}

export class Role extends iam.Role implements IPrincipal {
  public readonly roleArn: Output<string>;

  private readonly _inlinePolicies: input.iam.RoleInlinePolicy[];

  public readonly grantPrincipal: IPrincipal = this;

  readonly principalAccount?: string | undefined;

  constructor(name: string, args: RoleProps, options?: ResourceOptions) {
    const inlinePolicies = args.inlinePolicies ?? [];
    super(
      name,
      {
        ...args,
        inlinePolicies,
      },
      options
    );
    this._inlinePolicies = inlinePolicies;
    this.roleArn = this.arn;
  }

  public addToPrincipalPolicy(statement: iam.PolicyStatement): void {
    this._inlinePolicies.push({
      policy: JSON.stringify(statement),
    });
  }

  public grant(grantee: IPrincipal, ...actions: string[]) {
    grantee.addToPrincipalPolicy({
      Effect: "Allow",
      Action: actions,
      Resource: this.roleArn,
    });
  }

  /**
   * Grant permissions to the given principal to pass this role.
   */
  public grantPassRole(identity: IPrincipal) {
    return this.grant(identity, "iam:PassRole");
  }

  /**
   * Grant permissions to the given principal to assume this role.
   */
  public grantAssumeRole(identity: IPrincipal) {
    return this.grant(identity, "sts:AssumeRole");
  }
}
