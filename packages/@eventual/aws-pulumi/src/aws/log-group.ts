import { cloudwatch } from "@pulumi/aws";
import { Output, ResourceOptions } from "@pulumi/pulumi";
import { IGrantable } from "./grantable";

export interface ILogGroup {
  readonly logGroupArn: Output<string>;
  readonly logGroupName: Output<string>;

  grant(to: IGrantable, ...actions: string[]): void;
  grantWrite(to: IGrantable): void;
  grantRead(to: IGrantable): void;
}

export interface ImportedLogGroup extends ILogGroup {}

export class ImportedLogGroup {
  readonly logGroupName: Output<string>;
  constructor(readonly logGroupArn: Output<string>) {
    this.logGroupName = this.logGroupArn.apply((arn) =>
      arn.slice(arn.lastIndexOf(":"))
    );
  }
}

export interface LogGroup extends ILogGroup {}

export class LogGroup extends cloudwatch.LogGroup {
  readonly logGroupArn: Output<string>;
  readonly logGroupName: Output<string>;

  constructor(
    name: string,
    args: cloudwatch.LogGroupArgs,
    options?: ResourceOptions
  ) {
    super(name, args, options);
    this.logGroupArn = this.arn;
    this.logGroupName = this.name;
  }
}

mixin(LogGroup);
mixin(ImportedLogGroup);

function mixin(L: new (...args: any[]) => ILogGroup) {
  L.prototype.grant = function (to: IGrantable, ...actions: string[]) {
    to.grantPrincipal.addToPrincipalPolicy({
      Effect: "Allow",
      Action: actions,
      Resource: this.arn,
    });
  };

  L.prototype.grantWrite = function (to: IGrantable) {
    this.grant(to, "logs:CreateLogStream", "logs:PutLogEvents");
  };

  L.prototype.grantRead = function (to: IGrantable) {
    return this.grant(
      to,
      "logs:FilterLogEvents",
      "logs:GetLogEvents",
      "logs:GetLogGroupFields",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams"
    );
  };
}
