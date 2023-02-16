import { ENV_NAMES, ExecutionRecord } from "@eventual/aws-runtime";
import { Event } from "@eventual/core";
import { MetricsCommon, OrchestratorMetrics } from "@eventual/core-runtime";
import {
  Arn,
  aws_events,
  aws_events_targets,
  Names,
  RemovalPolicy,
  Stack,
} from "aws-cdk-lib";
import {
  Metric,
  MetricOptions,
  Statistic,
  Unit,
} from "aws-cdk-lib/aws-cloudwatch";
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  StreamViewType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
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
import { Construct } from "constructs";
import path from "path";
import {
  Activities,
  ActivityOverrides,
  IActivities,
  ServiceActivities,
} from "./activities.js";
import { BuildOutput, buildServiceSync } from "./build";
import { Events } from "./events";
import { grant } from "./grant";
import { Logging, LoggingProps } from "./logging";
import { lazyInterface } from "./proxy-construct";
import { IScheduler, Scheduler } from "./scheduler";
import { Api, CommandProps, IServiceApi } from "./service-api";
import {
  Subscription,
  SubscriptionOverrides,
  Subscriptions,
} from "./subscriptions";
import { IWorkflows, Workflows } from "./workflows";

export interface IService {
  /**
   * Subscribe this {@link Service} to another {@link Service}'s events.
   *
   * An Event Bridge {@link aws_events.Rule} will be created to route all events
   * that match the {@link SubscribeProps.events}.
   *
   * @param props the {@link SubscribeProps} specifying the service and events to subscribe to
   */
  subscribe(
    scope: Construct,
    id: string,
    props: SubscribeProps
  ): aws_events.Rule;
  addEnvironment(key: string, value: string): void;

  configureStartExecution(func: Function): void;
  grantStartExecution(grantable: IGrantable): void;

  /**
   * Read information about an execution or executions.
   *
   * * {@link EventualServiceClient.listExecutions}
   * * {@link EventualServiceClient.getExecution}
   * * {@link EventualServiceClient.getExecutionHistory}
   * * {@link EventualServiceClient.getExecutionWorkflowHistory}
   */
  configureReadExecutions(func: Function): void;
  /**
   * Read information about an execution or executions.
   *
   * * {@link EventualServiceClient.listExecutions}
   * * {@link EventualServiceClient.getExecution}
   * * {@link EventualServiceClient.getExecutionHistory}
   * * {@link EventualServiceClient.getExecutionWorkflowHistory}
   */
  grantReadExecutions(grantable: IGrantable): void;

  /**
   * Send signals to a workflow.
   */
  configureSendSignal(func: Function): void;
  /**
   * Send signals to a workflow.
   */
  grantSendSignal(grantable: IGrantable): void;

  /**
   * Publish Events
   */
  configurePublishEvents(func: Function): void;
  /**
   * Publish Events
   */
  grantPublishEvents(grantable: IGrantable): void;

  /**
   * Configure the ability to heartbeat, cancel, and complete activities.
   *
   * Useful for a function that is making an activity as complete.
   *
   * * {@link EventualServiceClient.sendActivitySuccess}
   * * {@link EventualServiceClient.sendActivityFailure}
   * * {@link EventualServiceClient.sendActivityHeartbeat}
   */
  configureUpdateActivity(func: Function): void;
  /**
   * Grants permission to use all operations on the {@link EventualServiceClient}.
   */
  configureForServiceClient(func: Function): void;

  configureServiceName(func: Function): void;

  /**
   * The time taken to run the workflow's function to advance execution of the workflow.
   *
   * This does not include the time taken to invoke commands or save history. It is
   * purely a metric for how well the workflow's function is performing as history grows.
   */
  metricAdvanceExecutionDuration(options?: MetricOptions): Metric;
  /**
   * The number of commands invoked in a single batch by the orchestrator.
   */
  metricCommandsInvoked(options?: MetricOptions): Metric;
  /**
   * The time taken to invoke all Commands emitted by advancing a workflow.
   */
  metricInvokeCommandsDuration(options?: MetricOptions): Metric;
  /**
   * Time taken to download an execution's history from S3.
   */
  metricLoadHistoryDuration(options?: MetricOptions): Metric;
  /**
   * Time taken to save an execution's history to S3.
   */
  metricSaveHistoryDuration(options?: MetricOptions): Metric;
  /**
   * The size of the history S3 file in bytes.
   */
  metricSavedHistoryBytes(options?: MetricOptions): Metric;
  /**
   * The number of events stored in the history S3 file.grantRead
   */
  metricSavedHistoryEvents(options?: MetricOptions): Metric;
  /**
   * The number of commands invoked in a single batch by the orchestrator.
   */
  metricMaxTaskAge(options?: MetricOptions): Metric;
}

/**
 * The properties for subscribing a Service to another Service's events.
 *
 * @see Service.subscribe
 */
export interface SubscribeProps extends aws_events_targets.EventBusProps {
  /**
   * The {@link Service} to subscribe to.
   */
  service: Service;
  /**
   * The events to subscribe to. Can specify a string or a reference to an {@link Event}.
   */
  events: (Event | string)[];
}

export interface ServiceProps<Service = any> {
  /**
   * The path of the `.ts` or `.js` file that is the entrypoint to the Service's logic.
   */
  entry: string;
  /**
   * Name of the {@link Service}. This is the name that will be
   *
   * @default - the {@link Service}'s {@link Construct.node} address.
   */
  name?: string;
  /**
   * Environment variables to include in all API, Event and Activity handler Functions.
   */
  environment?: {
    [key: string]: string;
  };
  /**
   * Override Properties of the Activity handlers within the service.
   */
  activities?: ActivityOverrides<Service>;
  /**
   * Override properties of Command Functions within the Service.
   */
  commands?: CommandProps<Service>;
  /**
   * Override properties of Subscription Functions within the Service.
   */
  subscriptions?: SubscriptionOverrides<Service>;
  /**
   * Configuration properties for the workflow orchestrator
   */
  workflows?: {
    /**
     * Set the reservedConcurrentExecutions for the workflow orchestrator lambda function.
     *
     * This function consumes from the central SQS FIFO Queue and the number of parallel executions
     * scales directly on the number of active workflow executions. Each execution id is used as
     * the message group ID which directly affects concurrent executions.
     *
     * Set this value to protect the workflow's concurrent executions from:
     * 1. browning out other functions by consuming concurrent executions
     * 2. be brought down by other functions in the AWS account
     * 3. ensure the timely performance of workflows for a given scale
     */
    reservedConcurrentExecutions?: number;
  };
  /**
   * Configure the Log Level and Log Group.
   */
  logging?: Omit<LoggingProps, "serviceName">;
}

export class Service<S = any> extends Construct implements IService {
  /**
   * Name of this Service.
   */
  public readonly serviceName: string;
  /**
   * This {@link Service}'s API Gateway.
   */
  public readonly api: Api<S>;
  /**
   * This {@link Service}'s {@link Events} that can be published and subscribed to.
   */
  public readonly events: Events;
  /**
   * The Subscriptions within this Service.
   */
  public readonly subscriptions: Subscriptions<S>;
  /**
   * The subsystem that controls activities.
   */
  public readonly activities: ServiceActivities<S>;
  /**
   * The subsystem that controls workflows.
   */
  public readonly workflows: Workflows;

  public readonly internal: {
    readonly activities: Activities<S>;
    /**
     * The {@link AppSec} inferred from the application code.
     */
    readonly build: BuildOutput;
    /**
     * A single-table used for execution data and granular workflow events/
     */
    readonly table: Table;
    /**
     * The subsystem for schedules and timers.
     */
    readonly scheduler: Scheduler;
    /**
     * A SSM parameter containing data about this service.
     */
    readonly serviceDataSSM: StringParameter;
    /**
     * The Resources for schedules and timers.
     */
    readonly cliRole: Role;
    /**
     * The resources used to facilitate service logging.
     */
    readonly logging: Logging;
  };

  public readonly grantPrincipal: IPrincipal;

  constructor(scope: Construct, id: string, props: ServiceProps<S>) {
    super(scope, id);

    this.serviceName = props.name ?? Names.uniqueResourceName(this, {});

    const build = buildServiceSync({
      serviceName: this.serviceName,
      entry: props.entry,
      outDir: path.join(".eventual", this.node.addr),
    });

    // Table - History, Executions
    const table = new Table(this, "Table", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      stream: StreamViewType.NEW_IMAGE,
      // timeToLiveAttribute: "ttl",
    });

    table.addLocalSecondaryIndex({
      indexName: ExecutionRecord.START_TIME_SORTED_INDEX,
      sortKey: {
        name: ExecutionRecord.START_TIME,
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    const proxyScheduler = lazyInterface<IScheduler>();
    const proxyWorkflows = lazyInterface<IWorkflows>();
    const proxyActivities = lazyInterface<IActivities>();
    const proxyService = lazyInterface<IService>();
    const apiProxy = lazyInterface<IServiceApi>();

    const logging = new Logging(this, "logging", {
      ...(props.logging ?? {}),
      serviceName: this.serviceName,
    });

    this.events = new Events(this, "Events", {
      serviceName: this.serviceName,
    });

    const activities = new Activities<S>(this, "Activities", {
      build: build,
      serviceName: this.serviceName,
      scheduler: proxyScheduler,
      workflows: proxyWorkflows,
      environment: props.environment,
      events: this.events,
      logging,
      service: proxyService,
      api: apiProxy,
      overrides: props.activities,
    });
    proxyActivities._bind(activities);
    this.activities = activities.activities;

    this.workflows = new Workflows(this, "Workflows", {
      build,
      serviceName: this.serviceName,
      scheduler: proxyScheduler,
      activities: activities,
      table,
      events: this.events,
      logging,
      service: proxyService,
      ...props.workflows,
    });
    proxyWorkflows._bind(this.workflows);

    const scheduler = new Scheduler(this, "Scheduler", {
      build,
      workflows: this.workflows,
      activities,
      logging,
    });
    proxyScheduler._bind(scheduler);

    this.api = new Api(this, "Api", {
      build,
      serviceName: this.serviceName,
      environment: props.environment,
      activities: activities,
      workflows: this.workflows,
      events: this.events,
      scheduler,
      service: proxyService,
      commands: props.commands,
    });
    apiProxy._bind(this.api);

    this.subscriptions = new Subscriptions(this, {
      api: this.api,
      build,
      environment: props.environment,
      events: this.events,
      service: proxyService,
      serviceName: this.serviceName,
      subscriptions: props.subscriptions,
    });

    this.grantPrincipal = new CompositePrincipal(
      // when granting permissions to the service,
      // propagate them to the following principals
      this.api.grantPrincipal,
      ...this.subscriptionsList.flatMap(
        (sub) => sub.handler.role?.grantPrincipal!
      )
    );

    // Access Role
    const cliRole = new Role(this, "EventualCliRole", {
      roleName: `eventual-cli-${this.serviceName}`,
      assumedBy: new AccountRootPrincipal(),
    });
    this.api.grantInvokeHttpServiceApi(cliRole);
    logging.grantFilterLogEvents(cliRole);

    // service metadata
    const serviceDataSSM = new StringParameter(this, "service-data", {
      parameterName: `/eventual/services/${this.serviceName}`,
      stringValue: JSON.stringify({
        apiEndpoint: this.api.gateway.apiEndpoint,
        eventBusArn: this.events.bus.eventBusArn,
        logGroupName: logging.logGroup.logGroupName,
      }),
    });

    serviceDataSSM.grantRead(cliRole);
    this.internal = {
      activities,
      build,
      cliRole,
      logging,
      scheduler,
      serviceDataSSM,
      table,
    };
    proxyService._bind(this);
  }

  public get activitiesList(): Subscription[] {
    return Object.values(this.activities);
  }

  public get subscriptionsList(): Subscription[] {
    return Object.values(this.subscriptions);
  }

  public subscribe(
    scope: Construct,
    id: string,
    props: SubscribeProps
  ): aws_events.Rule {
    return new aws_events.Rule(scope, id, {
      eventBus: props.service.events.bus,
      eventPattern: {
        detailType: props.events.map((event) =>
          typeof event === "string" ? event : event.name
        ),
      },
      targets: [new aws_events_targets.EventBus(this.events.bus)],
    });
  }

  /**
   * Add an environment variable to the Activity, API, Event and Workflow handler Functions.
   *
   * @param key The environment variable key.
   * @param value The environment variable's value.
   */
  public addEnvironment(key: string, value: string): void {
    this.activitiesList.forEach(({ handler }) =>
      handler.addEnvironment(key, value)
    );
    this.api.handlers.forEach((handler) => handler.addEnvironment(key, value));
    this.subscriptionsList.forEach(({ handler }) =>
      handler.addEnvironment(key, value)
    );
    this.workflows.orchestrator.addEnvironment(key, value);
  }

  /**
   * Service Client
   */

  public configureStartExecution(func: Function) {
    this.workflows.configureStartExecution(func);
  }

  @grant()
  public grantStartExecution(grantable: IGrantable) {
    this.workflows.grantStartExecution(grantable);
  }

  public configureReadExecutions(func: Function) {
    this.workflows.configureReadExecutions(func);
    this.workflows.configureReadExecutionHistory(func);
    this.workflows.configureReadHistoryState(func);
  }
  @grant()
  public grantReadExecutions(grantable: IGrantable) {
    this.workflows.grantReadExecutions(grantable);
  }

  public configureSendSignal(func: Function) {
    this.workflows.configureSendSignal(func);
  }

  @grant()
  public grantSendSignal(grantable: IGrantable) {
    this.workflows.grantSendSignal(grantable);
  }

  public configurePublishEvents(func: Function) {
    this.events.configurePublish(func);
  }

  @grant()
  public grantPublishEvents(grantable: IGrantable) {
    this.events.grantPublish(grantable);
  }

  public configureUpdateActivity(func: Function) {
    // complete activities
    this.internal.activities.configureCompleteActivity(func);
    // cancel
    this.internal.activities.configureWriteActivities(func);
    // heartbeat
    this.internal.activities.configureSendHeartbeat(func);
  }

  public configureForServiceClient(func: Function) {
    this.configureUpdateActivity(func);
    this.configurePublishEvents(func);
    this.configureReadExecutions(func);
    this.configureSendSignal(func);
    this.configureStartExecution(func);
  }

  public configureServiceName(func: Function) {
    this.addEnvs(func, ENV_NAMES.SERVICE_NAME);
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.SERVICE_NAME]: () => this.serviceName,
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
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

  public metricAdvanceExecutionDuration(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: OrchestratorMetrics.AdvanceExecutionDuration,
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  public metricCommandsInvoked(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: OrchestratorMetrics.CommandsInvoked,
      unit: Unit.COUNT,
      ...options,
    });
  }

  public metricInvokeCommandsDuration(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: OrchestratorMetrics.InvokeCommandsDuration,
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  public metricLoadHistoryDuration(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: OrchestratorMetrics.LoadHistoryDuration,
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  public metricSaveHistoryDuration(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: OrchestratorMetrics.SaveHistoryDuration,
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  public metricSavedHistoryBytes(options?: MetricOptions): Metric {
    return this.metric({
      metricName: OrchestratorMetrics.SavedHistoryBytes,
      unit: Unit.BYTES,
      statistic: Statistic.AVERAGE,
      ...options,
    });
  }

  public metricSavedHistoryEvents(options?: MetricOptions): Metric {
    return this.metric({
      metricName: OrchestratorMetrics.SavedHistoryEvents,
      unit: Unit.COUNT,
      statistic: Statistic.AVERAGE,
      ...options,
    });
  }

  public metricMaxTaskAge(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: OrchestratorMetrics.MaxTaskAge,
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  private metric(
    options: MetricOptions & {
      metricName: string;
    }
  ) {
    return new Metric({
      ...options,
      namespace: MetricsCommon.EventualNamespace,
      dimensionsMap: {
        ...options?.dimensionsMap,
        [MetricsCommon.ServiceNameDimension]: this.serviceName,
      },
    });
  }
}

export function runtimeHandlersEntrypoint(name: string) {
  return path.join(runtimeEntrypoint(), `/handlers/${name}.js`);
}

export function runtimeEntrypoint() {
  return path.join(require.resolve("@eventual/aws-runtime"), `../../esm`);
}
