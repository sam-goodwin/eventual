import { ENV_NAMES } from "@eventual/aws-runtime";
import { ServiceType } from "@eventual/core";
import { Arn, Duration, Names, RemovalPolicy, Stack } from "aws-cdk-lib";
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
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { execSync } from "child_process";
import { Construct } from "constructs";
import { ActivityController } from "./activity-controller";
import { Scheduler } from "./scheduler";
import { ServiceApi } from "./service-api";
import { ServiceFunction } from "./service-function";
import { addEnvironment, outDir } from "./utils";
import { WorkflowController } from "./workflow-controller";

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
   * This {@link Service}'s API Gateway.
   */
  readonly api: ServiceApi;
  /**
   * Infrastructure required to manipulate and communicate with a workflow.
   */
  public readonly workflowController: WorkflowController;
  /**
   * A single-table used for execution data and granular workflow events/
   */
  public readonly table: Table;
  /**
   * Infrastructure required to heartbeat, cancel, finish, and claim activities.
   */
  public readonly activityController: ActivityController;
  /**
   * The lambda function which runs the user's Activities.
   */
  public readonly activityWorker: Function;
  /**
   * The lambda function which runs the user's Workflow.
   */
  public readonly orchestrator: Function;
  /**
   * The Resources for schedules and sleep timers.
   */
  readonly scheduler: Scheduler;
  /**
   * Role used by cli
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

    execSync(
      `node ${require.resolve(
        "@eventual/compiler/bin/eventual-bundle.js"
      )} ${outDir(this)} ${props.entry}`
    ).toString("utf-8");

    // Table - History, Executions, ExecutionData
    this.table = new Table(this, "table", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.workflowController = new WorkflowController(
      this,
      "workflowController",
      {
        table: this.table,
      }
    );

    this.activityController = new ActivityController(
      this,
      "activityController",
      {
        workflowController: this.workflowController,
      }
    );

    this.orchestrator = new ServiceFunction(this, "Orchestrator", {
      serviceType: ServiceType.OrchestratorWorker,
      events: [
        new SqsEventSource(this.workflowController.workflowQueue, {
          batchSize: 10,
          reportBatchItemFailures: true,
        }),
      ],
    });

    this.activityWorker = new ServiceFunction(this, "Worker", {
      serviceType: ServiceType.ActivityWorker,
      memorySize: 512,
      environment: props.environment,
      // retry attempts should be handled with a new request and a new retry count in accordance with the user's retry policy.
      retryAttempts: 0,
      // TODO: determine worker timeout strategy
      timeout: Duration.minutes(1),
    });

    this.scheduler = new Scheduler(this, "Scheduler", {
      workflowController: this.workflowController,
      activityController: this.activityController,
    });

    this.api = new ServiceApi(this, "Api", {
      serviceName: this.serviceName,
      environment: props.environment,
      workflowController: this.workflowController,
    });

    this.grantPrincipal = new CompositePrincipal(
      // when granting permissions to the service,
      // propagate them to the following principals
      this.activityWorker.grantPrincipal,
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
          orchestrator: this.orchestrator.functionName,
          activityWorker: this.activityWorker.functionName,
        },
      }),
    });

    this.serviceDataSSM.grantRead(this.cliRole);

    this.configureActivityWorker();
    this.configureApiHandler();
    this.configureOrchestrator();
  }

  public grantRead(grantable: IGrantable) {
    this.table.grantReadData(grantable);
  }

  public grantFinishActivity(grantable: IGrantable) {
    this.workflowController.workflowQueue.grantSendMessages(grantable);
  }

  public grantStartWorkflow(grantable: IGrantable) {
    this.workflowController.grantWorkflowControl(grantable);
  }

  /**
   * Allows starting workflows, finishing activities, reading workflow status
   * and sending signals to workflows.
   */
  private configureWorkflowControl(func: Function) {
    this.workflowController.configureWorkflowControl(func);
  }

  /**
   * Grants the ability to heartbeat, cancel, finish, and lookup activities.
   */
  public grantControlActivities(grantable: IGrantable) {
    this.activityController.grantControlActivity(grantable);
  }

  /**
   * Configure the ability heartbeat, cancel, and finish activities.
   */
  public configureActivityControl(func: Function) {
    this.activityController.configureActivityControl(func);
  }

  private configureScheduleActivity(func: Function) {
    this.activityWorker.grantInvoke(func);
    addEnvironment(func, {
      [ENV_NAMES.ACTIVITY_WORKER_FUNCTION_NAME]:
        this.activityWorker.functionName,
    });
  }

  private configureActivityWorker() {
    // allows the activity worker to send events to the workflow queue
    // and lookup the status of the workflow.
    this.configureWorkflowControl(this.activityWorker);
    // allows the activity worker to claim activities and check their heartbeat status.
    this.configureActivityControl(this.activityWorker);
    // allows the activity worker to start the heartbeat monitor
    this.scheduler.configureScheduleTimer(this.activityWorker);
  }

  private configureOrchestrator() {
    // allows the orchestrator to save and load events from the history s3 bucket
    this.workflowController.configureRecordHistory(this.orchestrator);
    // allows the orchestrator to directly invoke the activity worker lambda function (async)
    this.configureScheduleActivity(this.orchestrator);
    // allows allows the orchestrator to start timeout and sleep timers
    this.scheduler.configureScheduleTimer(this.orchestrator);
    // allows the orchestrator to send events to the workflow queue,
    // write events to the execution table, and start other workflows
    this.workflowController.configureWorkflowControl(this.orchestrator);
    // allows the workflow to cancel activities
    this.activityController.configureActivityControl(this.orchestrator);
  }

  private configureApiHandler() {
    this.configureWorkflowControl(this.api.handler);
  }

  public grantFilterLogEvents(grantable: IGrantable) {
    const stack = Stack.of(this);
    grantable.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ["logs:FilterLogEvents"],
        effect: Effect.ALLOW,
        resources: [
          Arn.format(
            {
              service: "logs",
              resource: "/aws/lambda",
              resourceName: this.orchestrator.functionName,
            },
            stack
          ),
          Arn.format(
            {
              service: "logs",
              resource: "/aws/lambda",
              resourceName: this.activityWorker.functionName,
            },
            stack
          ),
        ],
      })
    );
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
