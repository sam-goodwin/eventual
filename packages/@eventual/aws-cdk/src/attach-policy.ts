import {
  Group,
  IGrantable,
  ManagedPolicy,
  Role,
  User,
} from "aws-cdk-lib/aws-iam";

export function attachPolicy(grantee: IGrantable, policy: ManagedPolicy) {
  if (grantee.grantPrincipal instanceof Role) {
    policy.attachToRole(grantee.grantPrincipal);
  } else if (grantee.grantPrincipal instanceof User) {
    policy.attachToUser(grantee.grantPrincipal);
  } else if (grantee.grantPrincipal instanceof Group) {
    policy.attachToGroup(grantee.grantPrincipal);
  } else {
    throw new Error(`Unsupported grantable type ${grantee.grantPrincipal}`);
  }
}
