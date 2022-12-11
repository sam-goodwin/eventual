import { AppSpec } from "@eventual/core";
import { Arn, Names, RemovalPolicy, Stack } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import {
  AccountRootPrincipal,
  CompositePrincipal,
  Effect,
  IGrantable,
  IPrincipal,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { execSync } from "child_process";
import { Construct } from "constructs";
import { Activities } from "./activities";
import { lazyInterface } from "./proxy-construct";
import { IScheduler, Scheduler } from "./scheduler";
import { Api } from "./service-api";
import { outDir } from "./utils";
import { IWorkflows, Workflows } from "./workflows";
import { Events } from "./events";

export interface ServiceProps {
  entry: string;
  name?: string;
  environment?: {
    [key: string]: string;
  };
}

export class Service extends Construct implements IGrantable {
  /**
   * Name of this Service.
   */
  public readonly serviceName: string;
  /**
   * The {@link AppSec} inferred from the application code.
   */
  readonly appSpec: AppSpec;
  /**
   * This {@link Service}'s API Gateway.
   */
  readonly api: Api;

  readonly events: Events;
  /**
   * A single-table used for execution data and granular workflow events/
   */
  public readonly table: Table;
  /**
   * The subsystem that controls activities.
   */
  public readonly activities: Activities;
  /**
   * The subsystem that controls workflows.
   */
  public readonly workflows: Workflows;
  /**
   * The subsystem for schedules and sleep timers.
   */
  readonly scheduler: Scheduler;
  /**
   * The Resources for schedules and sleep timers.
   */
  public readonly cliRole: Role;
  /**
   * A SSM parameter containing data about this service.
   */
  readonly serviceDataSSM: StringParameter;

  readonly grantPrincipal: IPrincipal;

  constructor(scope: Construct, id: string, props: ServiceProps) {
    super(scope, id);

    this.serviceName = props.name ?? Names.uniqueResourceName(this, {});

    this.appSpec = JSON.parse(
      execSync(
        `npx ts-node ${require.resolve(
          "@eventual/compiler/bin/eventual-infer.js"
        )} ${props.entry}`
      ).toString("utf-8")
    );

    execSync(
      `node ${require.resolve(
        "@eventual/compiler/bin/eventual-bundle.js"
      )} ${outDir(this)} ${props.entry}`
    ).toString("utf-8");

    // Table - History, Executions
    this.table = new Table(this, "Table", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const proxyScheduler = lazyInterface<IScheduler>();
    const proxyWorkflows = lazyInterface<IWorkflows>();

    this.events = new Events(this, "Events", {
      appSpec: this.appSpec,
      serviceName: this.serviceName,
      environment: props.environment,
      workflows: proxyWorkflows,
    });

    this.activities = new Activities(this, "Activities", {
      scheduler: proxyScheduler,
      workflows: proxyWorkflows,
      environment: props.environment,
      events: this.events,
    });

    this.workflows = new Workflows(this, "Workflows", {
      scheduler: proxyScheduler,
      activities: this.activities,
      table: this.table,
      events: this.events,
    });
    proxyWorkflows._bind(this.workflows);

    this.scheduler = new Scheduler(this, "Scheduler", {
      workflows: this.workflows,
      activities: this.activities,
    });
    proxyScheduler._bind(this.scheduler);

    this.api = new Api(this, "Api", {
      serviceName: this.serviceName,
      environment: props.environment,
      workflows: this.workflows,
      events: this.events,
    });

    this.grantPrincipal = new CompositePrincipal(
      // when granting permissions to the service,
      // propagate them to the following principals
      this.activities.worker.grantPrincipal,
      this.api.handler.grantPrincipal
    );

    this.cliRole = new Role(this, "EventualCliRole", {
      roleName: `eventual-cli-${this.serviceName}`,
      assumedBy: new AccountRootPrincipal(),
    });
    this.grantFilterLogEvents(this.cliRole);
    this.api.grantExecute(this.cliRole);

    this.serviceDataSSM = new StringParameter(this, "service-data", {
      parameterName: `/eventual/services/${this.serviceName}`,
      stringValue: JSON.stringify({
        apiEndpoint: this.api.gateway.apiEndpoint,
        functions: {
          orchestrator: this.workflows.orchestrator.functionName,
          activityWorker: this.activities.worker.functionName,
        },
      }),
    });

    this.serviceDataSSM.grantRead(this.cliRole);
  }

  public grantRead(grantable: IGrantable) {
    this.table.grantReadData(grantable);
  }

  public grantFinishActivity(grantable: IGrantable) {
    this.activities.grantCompleteActivity(grantable);
  }

  public grantStartWorkflow(grantable: IGrantable) {
    this.workflows.grantStartWorkflowEvent(grantable);
  }

  /**
   * Configure the ability heartbeat, cancel, and finish activities.
   */
  public configureFullActivityControl(func: Function) {
    this.activities.configureFullControl(func);
  }

  public grantFilterLogEvents(grantable: IGrantable) {
    this.workflows.grantFilterOrchestratorLogs(grantable);
    this.activities.grantFilterWorkerLogs(grantable);
  }

  /**
   * Allow a client to list services from ssm
   */
  public static grantDescribeParameters(stack: Stack, grantable: IGrantable) {
    grantable.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ["ssm:DescribeParameters"],
        effect: Effect.ALLOW,
        resources: [
          Arn.format(
            {
              service: "ssm",
              resource: "parameter",
              resourceName: "/eventual/services",
            },
            stack
          ),
        ],
      })
    );
  }
}
