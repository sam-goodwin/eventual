import { PolicyStatement } from "@pulumi/aws/iam";

/**
 * Any object that has an associated principal that a permission can be granted to
 */
export interface IGrantable {
  /**
   * The principal to grant permissions to
   */
  readonly grantPrincipal: IPrincipal;
}
/**
 * Represents a logical IAM principal.
 *
 * An IPrincipal describes a logical entity that can perform AWS API calls
 * against sets of resources, optionally under certain conditions.
 *
 * Examples of simple principals are IAM objects that you create, such
 * as Users or Roles.
 *
 * An example of a more complex principals is a `ServicePrincipal` (such as
 * `new ServicePrincipal("sns.amazonaws.com")`, which represents the Simple
 * Notifications Service).
 *
 * A single logical Principal may also map to a set of physical principals.
 * For example, `new OrganizationPrincipal('o-1234')` represents all
 * identities that are part of the given AWS Organization.
 */
export interface IPrincipal extends IGrantable {
  /**
   * The AWS account ID of this principal.
   * Can be undefined when the account is not known
   * (for example, for service principals).
   * Can be a Token - in that case,
   * it's assumed to be AWS::AccountId.
   */
  readonly principalAccount?: string;
  /**
   * Add to the policy of this principal.
   */
  addToPrincipalPolicy(statement: PolicyStatement): void;
}

export class CompositePrincipal implements IPrincipal {
  readonly grantPrincipal: IPrincipal = this;
  constructor(readonly principals: IPrincipal[]) {}
  public addToPrincipalPolicy(statement: PolicyStatement): void {
    this.principals.forEach((p) => p.addToPrincipalPolicy(statement));
  }
}
