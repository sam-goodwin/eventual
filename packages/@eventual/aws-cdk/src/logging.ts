import { ENV_NAMES } from "@eventual/aws-runtime";
import { RemovalPolicy } from "aws-cdk-lib";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

/**
 * Resources used to facilitate service logging.
 */
export class Logging extends Construct {
  /**
   * A common log group for the service.
   */
  public readonly logGroup: LogGroup;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.logGroup = new LogGroup(this, "group", {
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  public grantPutServiceLogs(grantable: IGrantable) {
    this.logGroup.grantWrite(grantable);
  }

  /**
   * Creating and writing to the {@link Logging.logGroup}
   */
  public configurePutServiceLogs(func: Function) {
    this.grantPutServiceLogs(func);
    func.addEnvironment(
      ENV_NAMES.SERVICE_LOG_GROUP_NAME,
      this.logGroup.logGroupName
    );
  }
}
