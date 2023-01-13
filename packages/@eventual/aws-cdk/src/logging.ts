import { ENV_NAMES } from "@eventual/aws-runtime";
import { LogLevel } from "@eventual/core";
import { RemovalPolicy } from "aws-cdk-lib";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import type { Service } from "./service";

export interface LoggingProps {
  /**
   * The name of the {@link Service} this {@link Logging} belongs to.
   */
  serviceName: string;
  /**
   * Optionally provide a log group.
   *
   * @default one will be created
   */
  logGroup?: LogGroup;
  /**
   * Log level to put into the workflow logs.
   *
   * @default INFO
   */
  logLevel?: LogLevel;
}

/**
 * Resources used to facilitate service logging.
 */
export class Logging extends Construct {
  /**
   * A common log group for the service.
   */
  public readonly logGroup: LogGroup;

  constructor(scope: Construct, id: string, private props: LoggingProps) {
    super(scope, id);

    this.logGroup =
      props.logGroup ??
      new LogGroup(this, "group", {
        removalPolicy: RemovalPolicy.DESTROY,
        logGroupName: `${props.serviceName}-execution-logs`,
      });
  }

  public grantFilterLogEvents(grantable: IGrantable) {
    this.logGroup.grant(grantable, "logs:FilterLogEvents");
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
    func.addEnvironment(
      ENV_NAMES.DEFAULT_LOG_LEVEL,
      this.props.logLevel ?? "INFO"
    );
  }
}
