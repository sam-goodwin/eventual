import { ssm } from "@pulumi/aws";
import { Output, ResourceOptions } from "@pulumi/pulumi";
import { IGrantable } from "./grantable";

export class Parameter extends ssm.Parameter {
  readonly parameterArn: Output<string>;

  constructor(name: string, args: ssm.ParameterArgs, opts?: ResourceOptions) {
    super(name, args, opts);
    this.parameterArn = this.arn;
  }

  public grantRead(grantee: IGrantable): void {
    // if (this.encryptionKey) {
    //   this.encryptionKey.grantDecrypt(grantee);
    // }
    grantee.grantPrincipal.addToPrincipalPolicy({
      Effect: "Allow",
      Action: [
        "ssm:DescribeParameters",
        "ssm:GetParameters",
        "ssm:GetParameter",
        "ssm:GetParameterHistory",
      ],
      Resource: this.arn,
    });
  }

  public grantWrite(grantee: IGrantable): void {
    // if (this.encryptionKey) {
    //   this.encryptionKey.grantEncrypt(grantee);
    // }
    grantee.grantPrincipal.addToPrincipalPolicy({
      Effect: "Allow",
      Action: ["ssm:PutParameter"],
      Resource: this.arn,
    });
  }
}
