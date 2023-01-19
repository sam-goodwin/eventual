import { getRegion, iam, lambda } from "@pulumi/aws";
import {
  ComponentResource,
  Input,
  output,
  Output,
  ResourceOptions,
} from "@pulumi/pulumi";
import { IGrantable, IPrincipal } from "./grantable";
import { ILogGroup, ImportedLogGroup } from "./log-group";
import { Role } from "./role";

export interface FunctionProps
  extends Omit<lambda.FunctionArgs, "environment" | "role"> {
  readonly environment?: Record<string, Input<string>>;
  readonly role?: iam.Role;
  readonly retryAttempts?: number;
}

export class Function extends ComponentResource implements IGrantable {
  readonly resource: lambda.Function;
  readonly environment: Record<string, Input<string>>;
  readonly role: iam.Role;

  readonly grantPrincipal: IPrincipal;

  readonly functionArn: Output<string>;
  readonly functionName: Output<string>;

  readonly logGroup: ILogGroup;

  constructor(id: string, props: FunctionProps, options: ResourceOptions) {
    super("eventual:Function", id, {}, options);

    this.environment = {
      ...props.environment,
      NODE_OPTIONS: "--enable-source-maps",
    };

    this.grantPrincipal = this.role = new Role(
      "Role",
      {
        assumeRolePolicy: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "sts:AssumeRole",
              Principal: {
                Service: "lambda.amazonaws.com",
              },
            },
          ],
        },
      },
      {
        parent: this,
      }
    );

    this.resource = new lambda.Function(
      "Resource",
      {
        ...props,
        role: this.role.arn,
        environment: {
          variables: this.environment,
        },
      },
      {
        parent: this,
      }
    );

    this.functionName = this.resource.name;
    this.functionArn = this.resource.arn;

    if (props.retryAttempts !== undefined) {
      new lambda.FunctionEventInvokeConfig("example", {
        functionName: this.functionName,
        maximumRetryAttempts: 0,

        // TODO: sane default?
        // maximumEventAgeInSeconds: 60,
      });
    }

    this.logGroup = new ImportedLogGroup(
      // arn:aws:logs:region:account-id:log-group:log_group_name
      output(
        Promise.all([iam.getAccountAlias(), getRegion()]).then(
          ([accountId, awsRegion]) =>
            `arn:aws:logs:${awsRegion}:${accountId}:log-group:/aws/lambda/${this.functionName}`
        )
      )
    );
  }

  public addEnvironment(key: string, value: Input<string>) {
    this.environment[key] = value;
  }

  public grantInvoke(to: IGrantable): void {
    to.grantPrincipal.addToPrincipalPolicy({
      Effect: "Allow",
      Action: "lambda::InvokeFunction",
      Resource: this.resource.arn,
    });
  }
}
