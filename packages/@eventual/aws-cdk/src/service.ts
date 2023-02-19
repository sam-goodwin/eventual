import { HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { ENV_NAMES } from "@eventual/aws-runtime";
import { Event } from "@eventual/core";
import { MetricsCommon, OrchestratorMetrics } from "@eventual/core-runtime";
import { Arn, aws_events, aws_events_targets, Names, Stack } from "aws-cdk-lib";
import {
  Metric,
  MetricOptions,
  Statistic,
  Unit,
} from "aws-cdk-lib/aws-cloudwatch";
import { IEventBus } from "aws-cdk-lib/aws-events/index.js";
import {
  AccountRootPrincipal,
  Effect,
  IGrantable,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { LogGroup } from "aws-cdk-lib/aws-logs/index.js";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import openapi from "openapi3-ts";
import path from "path";
import {
  Activities,
  ActivityOverrides,
  IActivities,
  ServiceActivities,
} from "./activities.js";
import { BuildOutput, buildServiceSync } from "./build";
import {
  CommandProps,
  Commands,
  ICommands,
  ServiceCommands,
  SystemCommands,
} from "./commands";
import { Events } from "./events";
import { grant } from "./grant";
import { lazyInterface } from "./proxy-construct";
import { IScheduler, Scheduler } from "./scheduler";
import {
  Subscription,
  SubscriptionOverrides,
  Subscriptions,
} from "./subscriptions";
import { IWorkflows, WorkflowOverrides, Workflows } from "./workflows";

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
   * Grants permission to use the {@link AWSHttpEventualClient} commands.
   */
  grantInvokeHttpServiceApi(grantable: IGrantable): void;

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
  workflows?: WorkflowOverrides;
}

export interface LoggingProps {}

export class Service<S = any> extends Construct implements IService {
  /**
   * The subsystem that controls activities.
   */
  public readonly activities: ServiceActivities<S>;
  /**
   * Bus which transports events in and out of the service.
   */
  public readonly bus: IEventBus;
  /**
   * Commands defined by the service.
   */
  public readonly commands: ServiceCommands<S>;
  /**
   * API Gateway which serves the service commands and the system commands.
   */
  public readonly gateway: HttpApi;
  /**
   * Name of this Service.
   */
  public readonly serviceName: string;
  /**
   * This {@link Service}'s API Gateway.
   */
  public readonly specification: openapi.OpenAPIObject;
  /**
   * The Subscriptions within this Service.
   */
  public readonly subscriptions: Subscriptions<S>;
  /**
   * Log group which workflow executions write to.
   */
  public readonly workflowLogGroup: LogGroup;

  private readonly events: Events;
  private readonly _commands: Commands<S>;

  public readonly system: {
    /**
     * The subsystem that controls workflows.
     */
    readonly workflowService: Workflows;
    readonly activityService: Activities<S>;
    /**`
     * The subsystem for schedules and timers.
     */
    readonly schedulerService: Scheduler;
    /**
     * The {@link AppSec} inferred from the application code.
     */
    readonly build: BuildOutput;
    readonly systemCommands: SystemCommands;
    /**
     * A SSM parameter containing data about this service.
     */
    readonly serviceMetadataSSM: StringParameter;
    /**
     * The Resources for schedules and timers.
     */
    readonly accessRole: Role;
  };

  constructor(scope: Construct, id: string, props: ServiceProps<S>) {
    super(scope, id);

    this.serviceName = props.name ?? Names.uniqueResourceName(this, {});

    const serviceScope = this;
    const systemScope = new Construct(this, "System");
    const eventualServiceScope = new Construct(this, "EventualService");

    const build = buildServiceSync({
      serviceName: this.serviceName,
      entry: props.entry,
      outDir: path.join(".eventual", this.node.addr),
    });

    const proxyScheduler = lazyInterface<IScheduler>();
    const proxyWorkflows = lazyInterface<IWorkflows>();
    const proxyActivities = lazyInterface<IActivities>();
    const proxyService = lazyInterface<IService>();
    const commandsProxy = lazyInterface<ICommands>();

    const serviceConstructProps: ServiceConstructProps = {
      build,
      environment: props.environment,
      service: proxyService,
      serviceName: this.serviceName,
      serviceScope,
      systemScope,
      eventualServiceScope,
    };

    this.events = new Events(serviceConstructProps);
    this.bus = this.events.bus;

    const activities = new Activities<S>({
      ...serviceConstructProps,
      scheduler: proxyScheduler,
      workflows: proxyWorkflows,
      commands: commandsProxy,
      overrides: props.activities,
    });
    proxyActivities._bind(activities);
    this.activities = activities.activities;

    const workflows = new Workflows({
      activities: activities,
      events: this.events,
      scheduler: proxyScheduler,
      ...serviceConstructProps,
      ...props.workflows,
    });
    proxyWorkflows._bind(workflows);
    this.workflowLogGroup = workflows.logGroup;

    const scheduler = new Scheduler({
      activities,
      workflows,
      ...serviceConstructProps,
    });
    proxyScheduler._bind(scheduler);

    this._commands = new Commands({
      activities: activities,
      commands: props.commands,
      events: this.events,
      workflows,
      ...serviceConstructProps,
    });
    commandsProxy._bind(this._commands);
    this.commands = this._commands.serviceCommands;
    this.gateway = this._commands.gateway;
    this.specification = this._commands.specification;

    this.subscriptions = new Subscriptions({
      commands: this._commands,
      events: this.events,
      subscriptions: props.subscriptions,
      ...serviceConstructProps,
    });

    const accessRole = new Role(eventualServiceScope, "AccessRole", {
      roleName: `eventual-cli-${this.serviceName}`,
      assumedBy: new AccountRootPrincipal(),
    });
    this._commands.grantInvokeHttpServiceApi(accessRole);
    workflows.grantFilterLogEvents(accessRole);

    // service metadata
    const serviceDataSSM = new StringParameter(
      eventualServiceScope,
      "ServiceMetadata",
      {
        parameterName: `/eventual/services/${this.serviceName}`,
        stringValue: JSON.stringify({
          apiEndpoint: this._commands.gateway.apiEndpoint,
          eventBusArn: this.bus.eventBusArn,
          workflowExecutionLogGroupName: workflows.logGroup.logGroupName,
        }),
      }
    );

    serviceDataSSM.grantRead(accessRole);
    this.system = {
      activityService: activities,
      build,
      accessRole: accessRole,
      schedulerService: scheduler,
      systemCommands: this._commands.systemCommands,
      serviceMetadataSSM: serviceDataSSM,
      workflowService: workflows,
    };
    proxyService._bind(this);
  }

  public get activitiesList(): Subscription[] {
    return Object.values(this.activities);
  }

  public get commandsList(): Function[] {
    return Object.values(this.commands);
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
      eventBus: props.service.bus,
      eventPattern: {
        detailType: props.events.map((event) =>
          typeof event === "string" ? event : event.name
        ),
      },
      targets: [new aws_events_targets.EventBus(this.bus)],
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
    this.commandsList.forEach((handler) => handler.addEnvironment(key, value));
    this.subscriptionsList.forEach(({ handler }) =>
      handler.addEnvironment(key, value)
    );
    this.system.workflowService.orchestrator.addEnvironment(key, value);
  }

  /**
   * Service Client
   */

  public configureStartExecution(func: Function) {
    this.system.workflowService.configureStartExecution(func);
  }

  @grant()
  public grantStartExecution(grantable: IGrantable) {
    this.system.workflowService.grantStartExecution(grantable);
  }

  public configureReadExecutions(func: Function) {
    this.system.workflowService.configureReadExecutions(func);
    this.system.workflowService.configureReadExecutionHistory(func);
    this.system.workflowService.configureReadHistoryState(func);
  }
  @grant()
  public grantReadExecutions(grantable: IGrantable) {
    this.system.workflowService.grantReadExecutions(grantable);
  }

  public configureSendSignal(func: Function) {
    this.system.workflowService.configureSendSignal(func);
  }

  @grant()
  public grantSendSignal(grantable: IGrantable) {
    this.system.workflowService.grantSendSignal(grantable);
  }

  public configurePublishEvents(func: Function) {
    this.events.configurePublish(func);
  }

  @grant()
  public grantPublishEvents(grantable: IGrantable) {
    this.events.grantPublish(grantable);
  }

  @grant()
  public grantInvokeHttpServiceApi(grantable: IGrantable) {
    this._commands.grantInvokeHttpServiceApi(grantable);
  }

  public configureUpdateActivity(func: Function) {
    // complete activities
    this.system.activityService.configureCompleteActivity(func);
    // cancel
    this.system.activityService.configureWriteActivities(func);
    // heartbeat
    this.system.activityService.configureSendHeartbeat(func);
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

export interface ServiceConstructProps {
  /**
   * The built service describing the event subscriptions within the Service.
   */
  readonly build: BuildOutput;
  /**
   * Optional environment variables to add to the {@link Events.defaultHandler}.
   *
   * @default - no extra environment variables
   */
  readonly environment?: Record<string, string>;
  readonly service: IService;
  readonly serviceName: string;
  readonly serviceScope: Construct;
  readonly systemScope: Construct;
  readonly eventualServiceScope: Construct;
}
