import { IHttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { ENV_NAMES } from "@eventual/aws-runtime";
import { Event } from "@eventual/core";
import { MetricsCommon, OrchestratorMetrics } from "@eventual/core-runtime";
import { EventualConfig, discoverEventualConfigSync } from "@eventual/project";
import { Metric, MetricOptions, Stats, Unit } from "aws-cdk-lib/aws-cloudwatch";
import aws_events from "aws-cdk-lib/aws-events";
import aws_events_targets from "aws-cdk-lib/aws-events-targets";
import {
  AccountRootPrincipal,
  Effect,
  IGrantable,
  IPrincipal,
  PolicyStatement,
  Role,
  UnknownPrincipal,
} from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { EngineVersion } from "aws-cdk-lib/aws-opensearchservice";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Arn, Names, Stack } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import type openapi from "openapi3-ts";
import path from "path";
import {
  BucketNotificationHandler,
  BucketNotificationHandlerOverrides,
  BucketOverrides,
  BucketService,
  ServiceBucketNotificationHandlers,
  ServiceBuckets,
} from "./bucket-service";
import { BuildOutput, buildServiceSync } from "./build";
import {
  ApiOverrides,
  CommandProps,
  CommandService,
  Commands,
  CommandsProps,
  CorsOptions,
} from "./command-service";
import { DeepCompositePrincipal } from "./deep-composite-principal.js";
import {
  EntityService,
  EntityServiceProps,
  EntityStream,
  EntityStreamOverrides,
  ServiceEntities,
  ServiceEntityStreams,
} from "./entity-service.js";
import { EventService } from "./event-service";
import { grant } from "./grant";
import { lazyInterface } from "./proxy-construct";
import {
  IQueue,
  QueueHandler,
  QueueOverrides,
  QueueService,
  ServiceQueues,
} from "./queue-service";
import { EventualResource } from "./resource";
import { SchedulerService } from "./scheduler-service";
import { SearchService, SearchServiceOverrides } from "./search/search-service";
import { ServerfulSearchService } from "./search/serverful-search-service";
import { ServerlessSearchService } from "./search/serverless-search-service";
import { Compliance, CompliancePolicyProps } from "./compliance";
import {
  ServiceConstructProps,
  WorkerServiceConstructProps,
} from "./service-common";
import {
  ISocket,
  SocketOverrides,
  SocketService,
  Sockets,
} from "./socket-service";
import {
  Subscription,
  SubscriptionOverrides,
  Subscriptions,
} from "./subscriptions";
import {
  ServiceTasks,
  Task,
  TaskOverrides,
  TaskService,
} from "./task-service.js";
import { WorkflowService, WorkflowServiceOverrides } from "./workflow-service";

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
   * Provide an explicit {@link EventualConfig} file or a path to the directory containing the eventual.json file.
   *
   * When not provided eventual will look for eventual.json file at the current working directory or up to two directories above.
   *
   * If the config file is not found or invalid, the synthesis will fail.
   */
  eventualConfig?: string | EventualConfig;
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
   * Environment variables to include in all API, Event and Task handler Functions.
   */
  environment?: {
    [key: string]: string;
  };
  /**
   * Override Properties of the Task handlers within the service.
   */
  tasks?: TaskOverrides<Service>;
  /**
   * Override properties of Command Functions within the Service.
   */
  commands?: CommandProps<Service>;
  /**
   * Override properties of Subscription Functions within the Service.
   */
  subscriptions?: SubscriptionOverrides<Service>;
  /**
   * Override the properties of an entity streams within the service.
   */
  entityStreams?: EntityStreamOverrides<Service>;
  /**
   * Override the properties of the buckets within the service.
   */
  buckets?: BucketOverrides<Service>;
  /**
   * Override the properties of the queues within the service.
   */
  queues?: QueueOverrides<Service>;
  /**
   * Override the properties of the socket apis within the service.
   */
  sockets?: SocketOverrides<Service>;
  /**
   * Override the properties of an bucket streams within the service.
   */
  bucketNotificationHandlers?: BucketNotificationHandlerOverrides<Service>;
  cors?: CorsOptions;
  /**
   * Customize the open API output for the gateway.
   *
   * Keep in mind that the output must be valid for APIGateway.
   */
  openApi?: CommandsProps<Service>["openApi"];
  api?: ApiOverrides;
  /**
   * Customize the configuration of the OpenSearch clusters and each of the OpenSearch Indices.
   */
  search?: SearchServiceOverrides<Service>;
  system?: {
    /**
     * Configuration properties for the workflow orchestrator
     */
    workflowService?: WorkflowServiceOverrides;
    entityService?: EntityServiceProps<Service>["entityServiceOverrides"];
  };
  compliance?: CompliancePolicyProps;
}

export interface ServiceSystem<S> {
  /**
   * The subsystem that controls workflows.
   */
  readonly workflowService: WorkflowService;
  readonly taskService: TaskService<S>;
  /** `
   * The subsystem for schedules and timers.
   */
  readonly schedulerService: SchedulerService;
  readonly entityService: EntityService<S>;
  /**
   * The {@link AppSec} inferred from the application code.
   */
  readonly build: BuildOutput;
  readonly systemCommandsHandler: Function;
  /**
   * A SSM parameter containing data about this service.
   */
  readonly serviceMetadataSSM: StringParameter;
  /**
   * Role used by the CLI and Local Environment.
   */
  readonly accessRole: Role;
}

export interface ServiceLocal {
  readonly environmentRole: Role;
}

export class Service<S = any> extends Construct {
  /**
   * The subsystem that controls tasks.
   */
  public readonly tasks: ServiceTasks<S>;
  /**
   * Bus which transports events in and out of the service.
   */
  public readonly bus: aws_events.IEventBus;
  /**
   * Commands defined by the service.
   */
  public readonly commands: Commands<S>;
  /**
   * Entities defined by the service;
   */
  public readonly entities: ServiceEntities<S>;
  /**
   * Streams of entity changes defined by the service.
   */
  public readonly entityStreams: ServiceEntityStreams<S>;
  /**
   * Buckets defined by the service.
   */
  public readonly buckets: ServiceBuckets<S>;
  /**
   * Queues defined by the service.
   */
  public readonly queues: ServiceQueues<S>;
  /**
   * Queues defined by the service.
   */
  public readonly sockets: Sockets<S>;
  /**
   * Handlers of bucket notification events defined by the service.
   */
  public readonly bucketNotificationHandlers: ServiceBucketNotificationHandlers<S>;
  /**
   * API Gateway which serves the service commands and the system commands.
   */
  public readonly gateway: IHttpApi;
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

  private readonly bucketService: BucketService<S>;
  private readonly eventService: EventService;
  private readonly commandService: CommandService<S>;
  private readonly socketService: SocketService<S>;

  public grantPrincipal: IPrincipal;
  public commandsPrincipal: IPrincipal;
  public tasksPrincipal: IPrincipal;
  public subscriptionsPrincipal: IPrincipal;
  public entityStreamsPrincipal: IPrincipal;
  public bucketNotificationHandlersPrincipal: IPrincipal;
  public queueHandlersPrincipal: IPrincipal;
  public socketHandlersPrincipal: IPrincipal;

  public readonly system: ServiceSystem<S>;

  /**
   * When present, local mode is enabled.
   *
   * Enable local mode by setting environment variable EVENTUAL_LOCAL=1 in deployment environment.
   */
  public readonly local?: ServiceLocal;
  /**
   * The search service for this service.
   */
  public readonly searchService: SearchService<S> | undefined;
  /**
   * Centralized control of Security and Compliance features.
   */
  public readonly compliancePolicy: Compliance;

  constructor(scope: Construct, id: string, props: ServiceProps<S>) {
    super(scope, id);

    const eventualConfig = props.eventualConfig
      ? typeof props.eventualConfig === "string"
        ? discoverEventualConfigSync(props.eventualConfig, 0)
        : props.eventualConfig
      : discoverEventualConfigSync();

    if (!eventualConfig) {
      throw new Error(
        "Could not find an eventual config file (eventual.json)."
      );
    }

    this.serviceName = props.name ?? Names.uniqueResourceName(this, {});

    const serviceScope = this;
    const systemScope = new Construct(this, "System");

    this.compliancePolicy = new Compliance(
      systemScope,
      "Compliance",
      props.compliance
    );

    const eventualServiceScope = new Construct(systemScope, "EventualService");

    const accessRole = new Role(eventualServiceScope, "AccessRole", {
      roleName: `eventual-cli-${this.serviceName}-${Stack.of(this).region}`,
      assumedBy: new AccountRootPrincipal(),
    });

    this.local = process.env.EVENTUAL_LOCAL
      ? {
          environmentRole: accessRole,
        }
      : undefined;

    const openApi = {
      info: {
        title: this.serviceName,
        // TODO: use the package.json?
        version: "1",
        ...props.openApi?.info,
      },
    };

    const build = buildServiceSync({
      serviceName: this.serviceName,
      entry: props.entry,
      outDir: path.join(eventualConfig.outDir, ".eventual", this.serviceName),
      openApi,
    });

    const proxySchedulerService = lazyInterface<SchedulerService>();
    const proxyWorkflowService = lazyInterface<WorkflowService>();
    const proxyTaskService = lazyInterface<TaskService<S>>();
    const proxyService = lazyInterface<Service<S>>();
    const proxyCommandService = lazyInterface<CommandService<S>>();
    const proxyBucketService = lazyInterface<BucketService<S>>();
    const proxyEntityService = lazyInterface<EntityService<S>>();
    const proxyQueueService = lazyInterface<QueueService<S>>();
    const proxySearchService = lazyInterface<SearchService<S>>();
    const proxySocketService = lazyInterface<SocketService<S>>();

    const serviceConstructProps: ServiceConstructProps = {
      build,
      environment: props.environment,
      service: proxyService,
      serviceName: this.serviceName,
      serviceScope,
      systemScope,
      eventualServiceScope,
      compliancePolicy: this.compliancePolicy,
    };

    const workerConstructProps: WorkerServiceConstructProps = {
      ...serviceConstructProps,
      bucketService: proxyBucketService,
      commandService: proxyCommandService,
      entityService: proxyEntityService,
      queueService: proxyQueueService,
      searchService: proxySearchService,
      socketService: proxySocketService,
    };

    this.eventService = new EventService(serviceConstructProps);
    this.bus = this.eventService.bus;

    if (build.search.indices.length > 0) {
      if (props.search?.serverless) {
        const searchProps = props.search;
        if (searchProps.serverless) {
          this.searchService = new ServerlessSearchService({
            collectionName: this.serviceName,
            ...serviceConstructProps,
            ...searchProps,
          });
        } else {
          this.searchService = new ServerfulSearchService({
            version: EngineVersion.OPENSEARCH_2_5,
            domainName: this.serviceName,
            ...serviceConstructProps,
            ...searchProps,
          });
        }
      } else {
        // default to cheap free tier Domain
        this.searchService = new ServerfulSearchService({
          version: EngineVersion.OPENSEARCH_2_5,
          domainName: this.serviceName,
          ...serviceConstructProps,
        });
      }
    }
    if (this.searchService) {
      proxySearchService._bind(this.searchService);
    }

    const entityService = new EntityService<S>({
      entityStreamOverrides: props.entityStreams,
      entityServiceOverrides: props.system?.entityService,
      eventService: this.eventService,
      workflowService: proxyWorkflowService,
      ...workerConstructProps,
    });
    this.entities = entityService.entities;
    this.entityStreams = entityService.entityStreams;
    proxyEntityService._bind(entityService);

    this.bucketService = new BucketService({
      ...workerConstructProps,
      cors: props.cors,
      bucketOverrides: props.buckets,
      bucketHandlerOverrides: props.bucketNotificationHandlers,
    });
    proxyBucketService._bind(this.bucketService);
    this.buckets = this.bucketService.buckets;
    this.bucketNotificationHandlers = this.bucketService.bucketHandlers;

    const taskService = new TaskService<S>({
      ...workerConstructProps,
      schedulerService: proxySchedulerService,
      workflowService: proxyWorkflowService,
      overrides: props.tasks,
      local: this.local,
    });
    proxyTaskService._bind(taskService);
    this.tasks = taskService.tasks;

    const workflowService = new WorkflowService({
      taskService,
      eventService: this.eventService,
      schedulerService: proxySchedulerService,
      overrides: props.system?.workflowService,
      ...workerConstructProps,
    });
    proxyWorkflowService._bind(workflowService);
    this.workflowLogGroup = workflowService.logGroup;

    const scheduler = new SchedulerService({
      taskService,
      workflowService,
      ...serviceConstructProps,
    });
    proxySchedulerService._bind(scheduler);

    this.commandService = new CommandService({
      taskService,
      overrides: props.commands,
      eventService: this.eventService,
      workflowService,
      cors: props.cors,
      local: this.local,
      openApi,
      apiOverrides: props.api,
      ...workerConstructProps,
    });
    proxyCommandService._bind(this.commandService);
    this.commands = this.commandService.serviceCommands;
    this.gateway = this.commandService.gateway;
    this.specification = this.commandService.specification;

    this.subscriptions = new Subscriptions({
      eventService: this.eventService,
      subscriptions: props.subscriptions,
      local: this.local,
      ...workerConstructProps,
    });

    const queueService = new QueueService({
      ...workerConstructProps,
      queueOverrides: props.queues,
    });
    proxyQueueService._bind(queueService);
    this.queues = queueService.queues;

    this.socketService = new SocketService({
      ...workerConstructProps,
      overrides: props.sockets,
      local: this.local,
    });
    proxySocketService._bind(this.socketService);
    this.sockets = this.socketService.sockets;

    this.commandService.grantInvokeHttpServiceApi(accessRole);
    workflowService.grantFilterLogEvents(accessRole);

    // service metadata
    const serviceDataSSM = new StringParameter(
      eventualServiceScope,
      "ServiceMetadata",
      {
        parameterName: `/eventual/services/${this.serviceName}`,
        stringValue: JSON.stringify({
          apiEndpoint: this.commandService.gateway.apiEndpoint,
          eventBusArn: this.bus.eventBusArn,
          workflowExecutionLogGroupName: workflowService.logGroup.logGroupName,
          environmentVariables: props.environment,
          socketEndpoints: Object.fromEntries(
            Object.entries<ISocket>(this.socketService.sockets).map(
              ([name, socket]) => [name, socket.gatewayStage.url]
            )
          ),
        }),
      }
    );

    this.commandsPrincipal = this.createResourceGroupPrincipal(
      this.commandsList
    );
    this.tasksPrincipal = this.createResourceGroupPrincipal(this.tasksList);
    this.subscriptionsPrincipal = this.createResourceGroupPrincipal(
      this.subscriptionsList
    );
    this.entityStreamsPrincipal = this.createResourceGroupPrincipal(
      this.entityStreamList
    );
    this.bucketNotificationHandlersPrincipal =
      this.createResourceGroupPrincipal(this.bucketNotificationHandlersList);
    this.queueHandlersPrincipal = this.createResourceGroupPrincipal(
      this.queueHandlersList
    );
    this.socketHandlersPrincipal = this.createResourceGroupPrincipal(
      this.socketHandlersList
    );
    this.grantPrincipal = new DeepCompositePrincipal(
      this.commandsPrincipal,
      this.tasksPrincipal,
      this.subscriptionsPrincipal,
      this.entityStreamsPrincipal,
      this.bucketNotificationHandlersPrincipal,
      this.queueHandlersPrincipal,
      this.socketHandlersPrincipal
    );

    serviceDataSSM.grantRead(accessRole);
    this.system = {
      accessRole,
      taskService,
      build,
      entityService,
      schedulerService: scheduler,
      systemCommandsHandler: this.commandService.systemCommandsHandler,
      serviceMetadataSSM: serviceDataSSM,
      workflowService,
    };
    proxyService._bind(this);
  }

  public get tasksList(): Task[] {
    return Object.values(this.tasks);
  }

  public get commandsList(): EventualResource[] {
    return Object.values(this.commands);
  }

  public get subscriptionsList(): Subscription[] {
    return Object.values(this.subscriptions);
  }

  public get entityStreamList(): EntityStream[] {
    return Object.values(this.entityStreams);
  }

  public get bucketNotificationHandlersList(): BucketNotificationHandler[] {
    return Object.values(this.bucketNotificationHandlers);
  }

  public get queueHandlersList(): QueueHandler[] {
    return Object.values<IQueue>(this.queues).map((q) => q.handler);
  }

  public get socketHandlersList(): ISocket[] {
    return Object.values<ISocket>(this.sockets);
  }

  private createResourceGroupPrincipal(grantables: IGrantable[]) {
    return grantables.length > 0 || this.local
      ? new DeepCompositePrincipal(
          ...(this.local ? [this.local.environmentRole] : []),
          ...grantables.map((f) => f.grantPrincipal)
        )
      : new UnknownPrincipal({ resource: this });
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
   * Add an environment variable to the Task, API, Event and Workflow handler Functions.
   *
   * @param key The environment variable key.
   * @param value The environment variable's value.
   */
  public addEnvironment(key: string, value: string): void {
    this.tasksList.forEach(({ handler }) => handler.addEnvironment(key, value));
    this.commandsList.forEach(({ handler }) =>
      handler.addEnvironment(key, value)
    );
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

  public configureEmitEvents(func: Function) {
    this.eventService.configureEmit(func);
  }

  @grant()
  public grantEmitEvents(grantable: IGrantable) {
    this.eventService.grantEmit(grantable);
  }

  @grant()
  public grantInvokeHttpServiceApi(grantable: IGrantable) {
    this.commandService.grantInvokeHttpServiceApi(grantable);
  }

  public configureUpdateTask(func: Function) {
    // complete tasks
    this.system.taskService.configureCompleteTask(func);
    // cancel
    this.system.taskService.configureWriteTasks(func);
    // heartbeat
    this.system.taskService.configureSendHeartbeat(func);
  }

  public configureGetExecutionLogs(func: Function) {
    this.system.workflowService.configureGetExecutionLogs(func);
  }

  public configureForServiceClient(func: Function) {
    this.configureUpdateTask(func);
    this.configureEmitEvents(func);
    this.configureReadExecutions(func);
    this.configureSendSignal(func);
    this.configureStartExecution(func);
    this.configureGetExecutionLogs(func);
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
      statistic: Stats.AVERAGE,
      metricName: OrchestratorMetrics.AdvanceExecutionDuration,
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  public metricCommandsInvoked(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Stats.AVERAGE,
      metricName: OrchestratorMetrics.CallsInvoked,
      unit: Unit.COUNT,
      ...options,
    });
  }

  public metricInvokeCommandsDuration(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Stats.AVERAGE,
      metricName: OrchestratorMetrics.InvokeCallsDuration,
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  public metricLoadHistoryDuration(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Stats.AVERAGE,
      metricName: OrchestratorMetrics.LoadHistoryDuration,
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  public metricSaveHistoryDuration(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Stats.AVERAGE,
      metricName: OrchestratorMetrics.SaveHistoryDuration,
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  public metricSavedHistoryBytes(options?: MetricOptions): Metric {
    return this.metric({
      metricName: OrchestratorMetrics.SavedHistoryBytes,
      unit: Unit.BYTES,
      statistic: Stats.AVERAGE,
      ...options,
    });
  }

  public metricSavedHistoryEvents(options?: MetricOptions): Metric {
    return this.metric({
      metricName: OrchestratorMetrics.SavedHistoryEvents,
      unit: Unit.COUNT,
      statistic: Stats.AVERAGE,
      ...options,
    });
  }

  public metricMaxTaskAge(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Stats.AVERAGE,
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
