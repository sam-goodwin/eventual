import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Function, Code, IFunction } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import {
  DeduplicationScope,
  FifoThroughputLimit,
  IQueue,
  Queue,
} from "aws-cdk-lib/aws-sqs";
import {
  AttributeType,
  BillingMode,
  ITable,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { ArnFormat, Names, RemovalPolicy, Stack } from "aws-cdk-lib";
import { ENV_NAMES, ServiceProperties } from "@eventual/aws-runtime";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import path from "path";
import { execSync } from "child_process";
import {
  AccountPrincipal,
  Effect,
  IGrantable,
  IPrincipal,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { CfnScheduleGroup } from "aws-cdk-lib/aws-scheduler";
import { HttpApi, HttpMethod } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpIamAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { baseNodeFnProps } from "./utils";
import { EventBus } from "aws-cdk-lib/aws-events";
import { ServiceFunction } from "./service-function";
import { ServiceType } from "@eventual/core";

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
   * The {@link EventBus} containing all events flowing into and out of this {@link Service}.
   */
  public readonly eventBus: EventBus;
  /**
   * The Lambda {@link Function} that handles events subscribed to in this service's {@link eventBus}.
   */
  public readonly eventHandler: Function;
  /**
   * S3 bucket that contains events necessary to replay a workflow execution.
   *
   * The orchestrator reads from history at the start and updates it at the end.
   */
  public readonly history: IBucket;
  /**
   * Workflow (fifo) queue which contains events that wake up a workflow execution.
   *
   * {@link WorkflowTask} delivery new {@link HistoryEvent}s to the workflow.
   */
  public readonly workflowQueue: IQueue;
  /**
   * Timer (standard) queue which helps orchestrate scheduled things like sleep and dynamic retries.
   *
   * Worths in tandem with the {@link CfnSchedulerGroup} to create millisecond latency, long running timers.
   */
  public readonly timerQueue: IQueue;
  /**
   * A group in which all of the workflow schedules are created under.
   */
  public readonly schedulerGroup: CfnScheduleGroup;
  /**
   * A single-table used for execution data and granular workflow events/
   */
  public readonly table: ITable;
  /**
   * A lambda function which can start a workflow.
   *
   * TODO: Replace with REST API.
   */
  public readonly startWorkflowFunction: IFunction;
  /**
   * A dynamo table used to lock/claim activities to enforce exactly once execution.
   */
  public readonly locksTable: ITable;
  /**
   * The lambda function which runs the user's Activities.
   */
  public readonly activityWorker: IFunction;
  /**
   * The lambda function which runs the user's Workflow.
   */
  public readonly orchestrator: IFunction;
  /**
   * The lambda function which executes timed requests on the timerQueue.
   */
  public readonly timerHandler: IFunction;
  /**
   * Forwards long running timers from the EventBridge schedules to the timer queue.
   *
   * The Timer Queue supports <15m timers at a sub second accuracy, the EventBridge schedule
   * support arbitrary length events at a sub minute accuracy.
   */
  public readonly scheduleForwarder: IFunction;
  /**
   * A common Dead Letter Queue to handle failures from various places.
   *
   * Timers - When the EventBridge scheduler fails to invoke the Schedule Forwarder Lambda.
   */
  public readonly dlq: Queue;
  /**
   * API Gateway for providing service api
   */
  public readonly api: HttpApi;
  /**
   * Role used to execute api
   */
  public readonly apiExecuteRole: Role;
  /*
   * The Lambda Function for processing inbound API requests with user defined code.
   */
  public readonly apiEndpoint: IFunction;
  /**
   * A SSM parameter containing data about this service.
   */
  readonly serviceDataSSM: StringParameter;
  /**
   * The Scheduler's IAM Role.
   */
  readonly schedulerRole: Role;

  readonly grantPrincipal: IPrincipal;

  constructor(scope: Construct, id: string, props: ServiceProps) {
    super(scope, id);

    this.serviceName = props.name ?? Names.uniqueResourceName(this, {});

    this.eventBus = new EventBus(this, "EventBus", {
      eventBusName: this.serviceName,
    });

    // ExecutionHistoryBucket
    this.history = new Bucket(this, "History", {
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // WorkflowQueue
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

    this.apiEndpoint = new ServiceFunction(this, "ApiEndpoint", {
      serviceType: ServiceType.ApiHandler,
      memorySize: 512,
      environment: props.environment,
    });

    this.eventHandler = new ServiceFunction(this, "EventHandler", {
      serviceType: ServiceType.EventHandler,
      memorySize: 512,
    });

    this.startWorkflowFunction = new NodejsFunction(
      this,
      "startWorkflowFunction",
      {
        entry: path.join(
          require.resolve("@eventual/aws-runtime"),
          "../../esm/handlers/start-workflow.js"
        ),
        handler: "handle",
        ...baseNodeFnProps,
        environment: {
          [ENV_NAMES.TABLE_NAME]: this.table.tableName,
          [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.workflowQueue.queueUrl,
        },
      }
    );

    this.locksTable = new Table(this, "Locks", {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });
    execSync(
      `node ${require.resolve(
        "@eventual/compiler/bin/eventual-bundle.js"
      )} ${this.outDir()} ${props.entry}`
    ).toString("utf-8");

    // grant methods on a workflow affect the activity
    this.grantPrincipal = this.activityWorker.grantPrincipal;

    this.schedulerGroup = new CfnScheduleGroup(this, "schedulerGroup");

    const scheduleGroupWildCardArn = Stack.of(this).formatArn({
      service: "scheduler",
      resource: "schedule",
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      resourceName: `${this.schedulerGroup.ref}/*`,
    });

    const schedulerRole = (this.schedulerRole = new Role(
      this,
      "schedulerRole",
      {
        assumedBy: new ServicePrincipal("scheduler.amazonaws.com", {
          conditions: {
            ArnEquals: {
              "aws:SourceArn": scheduleGroupWildCardArn,
            },
          },
        }),
      }
    ));

    this.dlq = new Queue(this, "dlq");

    this.dlq.grantSendMessages(schedulerRole);

    this.timerQueue = new Queue(this, "timerQueue");

    // TODO: handle failures to a DLQ - https://github.com/functionless/eventual/issues/40
    this.scheduleForwarder = new NodejsFunction(this, "scheduleForwarder", {
      entry: path.join(
        require.resolve("@eventual/aws-runtime"),
        "../../esm/handlers/schedule-forwarder.js"
      ),
      handler: "handle",
      ...baseNodeFnProps,
      environment: {
        [ENV_NAMES.SCHEDULER_GROUP]: this.schedulerGroup.ref,
        [ENV_NAMES.TIMER_QUEUE_URL]: this.timerQueue.queueUrl,
        [ENV_NAMES.SCHEDULER_ROLE_ARN]: schedulerRole.roleArn,
        [ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN]: this.dlq.queueArn,
        [ENV_NAMES.SCHEDULER_GROUP]: this.schedulerGroup.ref,
        [ENV_NAMES.TIMER_QUEUE_URL]: this.timerQueue.queueUrl,
      },
    });

    this.timerHandler = new NodejsFunction(this, "timerHandlerFunction", {
      entry: path.join(
        require.resolve("@eventual/aws-runtime"),
        "../../esm/handlers/timer-handler.js"
      ),
      handler: "handle",
      ...baseNodeFnProps,
      environment: {
        [ENV_NAMES.TABLE_NAME]: this.table.tableName,
        [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.workflowQueue.queueUrl,
      },
      events: [
        new SqsEventSource(this.timerQueue, {
          reportBatchItemFailures: true,
        }),
      ],
    });

    this.timerQueue.grantSendMessages(this.scheduleForwarder);

    // grants the orchestrator the permission to create new schedules for sleep.
    this.scheduleForwarder.addToRolePolicy(
      new PolicyStatement({
        actions: ["scheduler:DeleteSchedule"],
        resources: [scheduleGroupWildCardArn],
      })
    );

    this.table.grantReadWriteData(this.timerHandler);

    this.workflowQueue.grantSendMessages(this.timerHandler);

    // Enable creating history to start a workflow.
    this.table.grantReadWriteData(this.startWorkflowFunction);

    // Enable sending workflow task
    this.workflowQueue.grantSendMessages(this.startWorkflowFunction);

    // Allow the scheduler to create workflow tasks.
    this.scheduleForwarder.grantInvoke(schedulerRole);

    // grants the orchestrator the permission to create new schedules for sleep.
    this.orchestrator.addToRolePolicy(
      new PolicyStatement({
        actions: ["scheduler:CreateSchedule"],
        resources: [scheduleGroupWildCardArn],
      })
    );

    // grants the orchestrator the ability to pass the scheduler role to the creates schedules
    schedulerRole.grantPassRole(this.orchestrator.grantPrincipal);

    this.api = new HttpApi(this, "gateway", {
      apiName: `eventual-api-${this.serviceName}`,
      defaultAuthorizer: new HttpIamAuthorizer(),
      defaultIntegration: new HttpLambdaIntegration(
        "default",
        this.apiEndpoint
      ),
    });

    this.apiExecuteRole = new Role(this, "EventualApiRole", {
      roleName: `eventual-api-${this.serviceName}`,
      assumedBy: new AccountPrincipal(Stack.of(this).account),
      inlinePolicies: {
        execute: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ["execute-api:*"],
              effect: Effect.ALLOW,
              resources: [
                `arn:aws:execute-api:${Stack.of(this).region}:${
                  Stack.of(this).account
                }:${this.api.apiId}/*/*/*`,
              ],
            }),
          ],
        }),
      },
    });

    const apiLambdaEnvironment = {
      SERVICE: JSON.stringify({
        name: this.serviceName,
        tableName: this.table.tableName,
        workflowQueueUrl: this.workflowQueue.queueUrl,
        executionHistoryBucket: this.history.bucketName,
        orchestratorFunctionName: this.orchestrator.functionName,
        activityWorkerFunctionName: this.activityWorker.functionName,
      } satisfies ServiceProperties),
      [ENV_NAMES.ACTIVITY_WORKER_FUNCTION_NAME]:
        this.activityWorker.functionName,
      [ENV_NAMES.EXECUTION_HISTORY_BUCKET]: this.history.bucketName,
      [ENV_NAMES.TABLE_NAME]: this.table.tableName,
      [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.workflowQueue.queueUrl,
      [ENV_NAMES.SCHEDULER_ROLE_ARN]: schedulerRole.roleArn,
      [ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN]: this.dlq.queueArn,
      [ENV_NAMES.SCHEDULER_GROUP]: this.schedulerGroup.ref,
      [ENV_NAMES.TIMER_QUEUE_URL]: this.timerQueue.queueUrl,
      [ENV_NAMES.SCHEDULE_FORWARDER_ARN]: this.scheduleForwarder.functionArn,
    };

    const route = (mappings: Record<string, RouteMapping | RouteMapping[]>) => {
      Object.entries(mappings).forEach(([path, mappings]) => {
        const mappingsArray = Array.isArray(mappings) ? mappings : [mappings];
        mappingsArray.forEach(({ entry, methods, grants }) => {
          const id =
            //Generate id for the lambda based on its path and method
            path
              .slice(1)
              .replace("/", "-")
              .replace(/[\{\}]/, "") + methods?.join("-") ?? [];
          const fn =
            "api" in entry
              ? this.apiLambda(id, entry.api, apiLambdaEnvironment)
              : this.prebundledLambda(id, entry.bundled, apiLambdaEnvironment);
          grants?.(fn);
          const integration = new HttpLambdaIntegration(
            `${id}-integration`,
            fn
          );
          this.api.addRoutes({
            path,
            integration,
            methods,
          });
        });
      });
    };

    route({
      "/_eventual/workflows": {
        methods: [HttpMethod.GET],
        entry: { bundled: "list-workflows" },
      },
      "/_eventual/workflows/{name}/executions": [
        {
          methods: [HttpMethod.POST],
          entry: { api: "executions/new.js" },
          grants: (fn) => {
            this.table.grantReadWriteData(fn);
            this.workflowQueue.grantSendMessages(fn);
          },
        },
        {
          methods: [HttpMethod.GET],
          entry: { api: "executions/list.js" },
          grants: (fn) => {
            this.table.grantReadWriteData(fn);
            this.workflowQueue.grantSendMessages(fn);
          },
        },
      ],
      "/_eventual/executions/{executionId}/history": {
        methods: [HttpMethod.GET],
        entry: { api: "executions/history.js" },
        grants: (fn) => this.table.grantReadData(fn),
      },
      "/_eventual/executions/{executionId}/workflow-history": {
        methods: [HttpMethod.GET],
        entry: { api: "executions/workflow-history.js" },
        grants: (fn) => this.history.grantRead(fn),
      },
    });

    this.serviceDataSSM = new StringParameter(this, "service-data", {
      parameterName: `/eventual/services/${this.serviceName}`,
      stringValue: JSON.stringify({
        apiEndpoint: this.api.apiEndpoint,
        functions: {
          orchestrator: this.orchestrator.functionName,
          activityWorker: this.activityWorker.functionName,
        },
      }),
    });

    this.finalize();
  }

  private finalizers: (() => void)[] = [];

  public onFinalize(fn: () => void): void {
    this.finalizers.push(fn);
  }

  private finalize() {
    this.finalizers.forEach((finalizer) => finalizer());
  }

  /**
   * Grants permission to publish to this {@link Service}'s {@link eventBus}.
   */
  public grantPublish(grantable: IGrantable) {
    this.eventBus.grantPutEventsTo(grantable);
  }

  public grantStartWorkflow(grantable: IGrantable) {
    this.workflowQueue.grantSendMessages(grantable);
    this.table.grantReadWriteData(grantable);
  }

  public grantRead(grantable: IGrantable) {
    this.history.grantRead(grantable);
    this.table.grantReadData(grantable);
  }

  private apiLambda(
    id: string,
    entry: string,
    environment: Record<string, string>
  ): NodejsFunction {
    return new NodejsFunction(this, id, {
      entry: path.join(
        require.resolve("@eventual/aws-runtime"),
        "../../esm/handlers/api",
        entry
      ),
      ...baseNodeFnProps,
      environment,
    });
  }

  private prebundledLambda(
    id: string,
    entry: string,
    environment: Record<string, string>
  ) {
    return new Function(this, id, {
      code: Code.fromAsset(this.outDir(entry)),
      ...baseNodeFnProps,
      handler: "index.handler",
      environment,
    });
  }

  public outDir(...paths: string[]): string {
    return path.join(".eventual", this.node.addr, ...paths);
  }
}

interface RouteMapping {
  methods?: HttpMethod[];
  entry: { api: string } | { bundled: string };
  grants?: (grantee: IGrantable) => void;
}
