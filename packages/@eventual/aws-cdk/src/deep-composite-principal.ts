import {
  AddToPrincipalPolicyResult,
  CompositePrincipal,
  IPrincipal,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import { DependencyGroup, IDependable } from "constructs";

export class DeepCompositePrincipal extends CompositePrincipal {
  private _principals: IPrincipal[];
  constructor(..._principals: IPrincipal[]) {
    super(..._principals);
    // @ts-ignore
    this._principals = this._principals ?? [];
  }

  /**
   * The base copies the principals out, do the same for our local array.
   */
  override addPrincipals(...principals: IPrincipal[]): this {
    super.addPrincipals(...principals);
    // this may be called before we _principals is initialized
    if (!this._principals) {
      this._principals = [];
    }
    this._principals.push(...principals);
    return this;
  }

  /**
   * Try to add the policy statement to the policy of each principal.
   */
  override addToPrincipalPolicy(
    statement: PolicyStatement
  ): AddToPrincipalPolicyResult {
    console.log(statement);
    const res = this._principals.map((p) => p.addToPrincipalPolicy(statement));
    const added = res.every((s) => s.statementAdded);
    if (added) {
      const dependable = res
        .map((s) => s.policyDependable)
        .filter((p): p is IDependable => !!p);

      return {
        statementAdded: added,
        policyDependable: new DependencyGroup(...dependable),
      };
    } else {
      return { statementAdded: false };
    }
  }
}
