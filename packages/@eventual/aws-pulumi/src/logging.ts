import { ENV_NAMES } from "@eventual/aws-runtime";
import { LogLevel } from "@eventual/core";
import { iam } from "@pulumi/aws";
import { ComponentResource, ComponentResourceOptions } from "@pulumi/pulumi";
import type { Service } from "./service";
import { Function } from "./aws/function";
import { IGrantable } from "./aws/grantable";
import { LogGroup } from "./aws/log-group";

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
export class Logging extends ComponentResource {
  /**
   * A common log group for the service.
   */
  public readonly logGroup: LogGroup;

  public readonly filterPolicy: iam.Policy;

  constructor(
    id: string,
    private props: LoggingProps,
    options?: ComponentResourceOptions
  ) {
    super("eventual:Logging", id, {}, options);

    this.logGroup =
      props.logGroup ??
      new LogGroup(
        "Group",
        {
          name: `${props.serviceName}-execution-logs`,
        },
        {
          parent: this,
        }
      );

    this.filterPolicy = new iam.Policy(
      "FilterLogEvents",
      {
        policy: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "logs:FilterLogEvents",
              Resource: this.logGroup.arn,
            },
          ],
        },
      },
      {
        parent: this,
      }
    );
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

    func.addEnvironment(ENV_NAMES.SERVICE_LOG_GROUP_NAME, this.logGroup.name);
    func.addEnvironment(
      ENV_NAMES.DEFAULT_LOG_LEVEL,
      this.props.logLevel ?? "INFO"
    );
  }
}
