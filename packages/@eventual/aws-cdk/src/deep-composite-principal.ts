import {
  AddToPrincipalPolicyResult,
  CompositePrincipal,
  IPrincipal,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import { DependencyGroup, IDependable } from "constructs";

/**
 * {@link CompositePrincipal} only works with assumes principals and on grants to resources
 * with resource policies (ex: SQS). Resources that that require principal policies (dynamo) will fail silently.
 *
 * This sub-class is an attempt to support some principal policy use cases like dynamo.
 *
 * In the case of dynamo, the composite will try to add a policy statement to each nested principal's
 * policy.
 */
export class DeepCompositePrincipal extends CompositePrincipal {
  private __principals: IPrincipal[];
  constructor(..._principals: IPrincipal[]) {
    super(..._principals);
    // @ts-ignore
    this.__principals = this.__principals ?? [];
  }

  /**
   * The base copies the principals out, do the same for our local array.
   */
  public override addPrincipals(...principals: IPrincipal[]): this {
    super.addPrincipals(...principals);
    // this may be called before we _principals is initialized
    if (!this.__principals) {
      this.__principals = [];
    }
    this.__principals.push(...principals);
    return this;
  }

  /**
   * Try to add the policy statement to the policy of each principal.
   */
  public override addToPrincipalPolicy(
    statement: PolicyStatement
  ): AddToPrincipalPolicyResult {
    const res = this.__principals.map((p) => p.addToPrincipalPolicy(statement));
    const added = res.every((s) => s.statementAdded);
    if (added) {
      const dependables = res
        .map((s) => s.policyDependable)
        .filter((p): p is IDependable => !!p);

      return {
        statementAdded: added,
        // aggregate all of the nested dependables.
        policyDependable: new DependencyGroup(...dependables),
      };
    } else {
      return { statementAdded: false };
    }
  }
}
