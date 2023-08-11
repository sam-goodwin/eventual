import { IGrantable, IPrincipal } from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { DeepCompositePrincipal } from "./deep-composite-principal";
import { ServiceLocal } from "./service";

export class EventualResource implements IGrantable {
  public grantPrincipal: IPrincipal;
  constructor(public handler: Function, local?: ServiceLocal) {
    this.grantPrincipal = local
      ? new DeepCompositePrincipal(
          handler.grantPrincipal,
          local.environmentRole
        )
      : handler.grantPrincipal;
  }
}
