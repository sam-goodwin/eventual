import { ENV_NAMES } from "@eventual/aws-runtime";
import { ServiceType } from "@eventual/core";
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
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Bucket } from "aws-cdk-lib/aws-s3";
import {
  DeduplicationScope,
  FifoThroughputLimit,
  Queue,
} from "aws-cdk-lib/aws-sqs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { execSync } from "child_process";
import { Construct } from "constructs";
import { Scheduler } from "./scheduler";
import { ServiceApi } from "./service-api";
import { ServiceFunction } from "./service-function";
import { addEnvironment, outDir } from "./utils";

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
   * S3 bucket that contains events necessary to replay a workflow execution.
   *
   * The orchestrator reads from history at the start and updates it at the end.
   */
  public readonly history: Bucket;
  /**
   * Workflow (fifo) queue which contains events that wake up a workflow execution.
   *
   * {@link WorkflowTask} delivery new {@link HistoryEvent}s to the workflow.
   */
  public readonly workflowQueue: Queue;
  /**
   * A single-table used for execution data and granular workflow events/
   */
  public readonly table: Table;
  /**
   * A dynamo table used to lock/claim activities to enforce exactly once execution.
   */
  public readonly locksTable: Table;
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

    this.history = new Bucket(this, "History", {
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.workflowQueue = new Queue(this, "WorkflowQueue", {
      fifo: true,
      fifoThroughputLimit: FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
      deduplicationScope: DeduplicationScope.MESSAGE_GROUP,
      contentBasedDeduplication: true,
    });

    // Table - History, Executions, ExecutionData
    this.table = new Table(this, "table", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.orchestrator = new ServiceFunction(this, "Orchestrator", {
      serviceType: ServiceType.OrchestratorWorker,
      events: [
        new SqsEventSource(this.workflowQueue, {
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
    });

    this.locksTable = new Table(this, "Locks", {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.scheduler = new Scheduler(this, "Scheduler", {
      orchestrator: this.orchestrator,
      table: this.table,
      workflowQueue: this.workflowQueue,
    });

    this.api = new ServiceApi(this, "Api", {
      serviceName: this.serviceName,
      environment: props.environment,
      activityWorker: this.activityWorker,
      history: this.history,
      orchestrator: this.orchestrator,
      scheduler: this.scheduler,
      table: this.table,
      workflowQueue: this.workflowQueue,
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
    this.history.grantRead(grantable);
    this.table.grantReadData(grantable);
  }

  public grantFinishActivity(grantable: IGrantable) {
    this.workflowQueue.grantSendMessages(grantable);
  }

  public grantStartWorkflow(grantable: IGrantable) {
    this.workflowQueue.grantSendMessages(grantable);
    this.table.grantReadWriteData(grantable);
  }

  private configureStartWorkflow(func: Function) {
    this.grantStartWorkflow(func);
    addEnvironment(func, {
      [ENV_NAMES.TABLE_NAME]: this.table.tableName,
      [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.workflowQueue.queueUrl,
    });
  }

  private configureScheduleActivity(func: Function) {
    this.activityWorker.grantInvoke(func);
    addEnvironment(func, {
      [ENV_NAMES.ACTIVITY_WORKER_FUNCTION_NAME]:
        this.activityWorker.functionName,
    });
  }

  private configureRecordHistory(func: Function) {
    this.history.grantReadWrite(func);
    addEnvironment(func, {
      [ENV_NAMES.EXECUTION_HISTORY_BUCKET]: this.history.bucketName,
    });
  }

  private configureActivityWorker() {
    this.configureStartWorkflow(this.activityWorker);

    // the worker will issue an UpdateItem command to lock
    this.locksTable.grantWriteData(this.activityWorker);

    addEnvironment(this.activityWorker, {
      [ENV_NAMES.ACTIVITY_LOCK_TABLE_NAME]: this.locksTable.tableName,
    });
  }

  private configureOrchestrator() {
    this.configureRecordHistory(this.orchestrator);
    this.configureScheduleActivity(this.orchestrator);
    this.scheduler.configureScheduleTimer(this.orchestrator);
    this.configureStartWorkflow(this.orchestrator);
  }

  private configureApiHandler() {
    this.configureStartWorkflow(this.api.handler);
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
