import { ENV_NAMES, ExecutionRecord } from "@eventual/aws-runtime";
import { Event } from "@eventual/core";
import { MetricsCommon, OrchestratorMetrics } from "@eventual/runtime-core";
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
import { Activities, IActivities } from "./activities";
import { BuildOutput, buildServiceSync } from "./build";
import { Events } from "./events";
import { grant } from "./grant";
import { Logging, LoggingProps } from "./logging";
import { lazyInterface } from "./proxy-construct";
import { IScheduler, Scheduler } from "./scheduler";
import { Api, CommandProps, IServiceApi } from "./service-api";
import { PickType } from "./utils";
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
   *
   */
  commands?: CommandProps<Service>;
  events?: {
    handlers?: {
      [eventHandler in keyof PickType<Service, { kind: "EventHandler" }>]?: any;
    };
  };
  workflows?: {
    reservedConcurrentExecutions?: number;
  };
  logging?: Omit<LoggingProps, "serviceName">;
}

export class Service<S = any>
  extends Construct
  implements IGrantable, IService
{
  /**
   * Name of this Service.
   */
  public readonly serviceName: string;
  /**
   * The {@link AppSec} inferred from the application code.
   */
  public readonly build: BuildOutput;
  /**
   * This {@link Service}'s API Gateway.
   */
  public readonly api: Api<S>;
  /**
   * This {@link Service}'s {@link Events} that can be published and subscribed to.
   */
  public readonly events: Events<S>;
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
   * The subsystem for schedules and timers.
   */
  public readonly scheduler: Scheduler;
  /**
   * The Resources for schedules and timers.
   */
  public readonly cliRole: Role;
  /**
   * A SSM parameter containing data about this service.
   */
  public readonly serviceDataSSM: StringParameter;
  /**
   * The resources used to facilitate service logging.
   */
  public readonly logging: Logging;

  public readonly grantPrincipal: IPrincipal;

  constructor(scope: Construct, id: string, props: ServiceProps<S>) {
    super(scope, id);

    this.serviceName = props.name ?? Names.uniqueResourceName(this, {});

    this.build = buildServiceSync({
      serviceName: this.serviceName,
      entry: props.entry,
      outDir: path.join(".eventual", this.node.addr),
    });

    // Table - History, Executions
    this.table = new Table(this, "Table", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.table.addLocalSecondaryIndex({
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

    this.logging = new Logging(this, "logging", {
      ...(props.logging ?? {}),
      serviceName: this.serviceName,
    });

    this.events = new Events(this, "Events", {
      build: this.build,
      serviceName: this.serviceName,
      environment: props.environment,
      service: proxyService,
      api: apiProxy,
    });

    this.activities = new Activities(this, "Activities", {
      build: this.build,
      serviceName: this.serviceName,
      scheduler: proxyScheduler,
      workflows: proxyWorkflows,
      environment: props.environment,
      events: this.events,
      logging: this.logging,
      service: proxyService,
      api: apiProxy,
    });
    proxyActivities._bind(this.activities);

    this.workflows = new Workflows(this, "Workflows", {
      build: this.build,
      serviceName: this.serviceName,
      scheduler: proxyScheduler,
      activities: this.activities,
      table: this.table,
      events: this.events,
      logging: this.logging,
      service: proxyService,
      ...props.workflows,
    });
    proxyWorkflows._bind(this.workflows);

    this.scheduler = new Scheduler(this, "Scheduler", {
      build: this.build,
      workflows: this.workflows,
      activities: this.activities,
      logging: this.logging,
    });
    proxyScheduler._bind(this.scheduler);

    this.api = new Api(this, "Api", {
      build: this.build,
      serviceName: this.serviceName,
      environment: props.environment,
      activities: this.activities,
      workflows: this.workflows,
      events: this.events,
      scheduler: this.scheduler,
      service: proxyService,
      commands: props.commands,
    });
    apiProxy._bind(this.api);

    this.grantPrincipal = new CompositePrincipal(
      // when granting permissions to the service,
      // propagate them to the following principals
      this.activities.worker.grantPrincipal,
      this.api.commands.default.grantPrincipal,
      this.events.defaultHandler.grantPrincipal
    );

    this.cliRole = new Role(this, "EventualCliRole", {
      roleName: `eventual-cli-${this.serviceName}`,
      assumedBy: new AccountRootPrincipal(),
    });
    this.api.grantInvokeHttpServiceApi(this.cliRole);
    this.logging.grantFilterLogEvents(this.cliRole);

    this.serviceDataSSM = new StringParameter(this, "service-data", {
      parameterName: `/eventual/services/${this.serviceName}`,
      stringValue: JSON.stringify({
        apiEndpoint: this.api.gateway.apiEndpoint,
        eventBusArn: this.events.bus.eventBusArn,
        logGroupName: this.logging.logGroup.logGroupName,
      }),
    });

    this.serviceDataSSM.grantRead(this.cliRole);
    proxyService._bind(this);
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
    this.activities.worker.addEnvironment(key, value);
    this.api.handlers.forEach((handler) => handler.addEnvironment(key, value));
    this.events.defaultHandler.addEnvironment(key, value);
    this.events.handlersList.forEach((handler) =>
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
    this.activities.configureCompleteActivity(func);
    // cancel
    this.activities.configureWriteActivities(func);
    // heartbeat
    this.activities.configureSendHeartbeat(func);
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
