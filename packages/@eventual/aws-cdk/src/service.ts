import {
  AppSpec,
  MetricsCommon,
  OrchestratorMetrics,
  ServiceType,
} from "@eventual/core";
import { Arn, Names, RemovalPolicy, Stack } from "aws-cdk-lib";
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
import { Activities, IActivities } from "./activities";
import { lazyInterface } from "./proxy-construct";
import { IScheduler, Scheduler } from "./scheduler";
import { Api } from "./service-api";
import { outDir } from "./utils";
import { IWorkflows, Workflows, WorkflowsProps } from "./workflows";
import { Events } from "./events";
import {
  Metric,
  MetricOptions,
  Statistic,
  Unit,
} from "aws-cdk-lib/aws-cloudwatch";
import { bundleSourcesSync, inferSync } from "./compile-client";
import path from "path";
import { ExecutionRecord } from "@eventual/aws-runtime";
import { Logging } from "./logging";

export interface ServiceProps {
  entry: string;
  name?: string;
  environment?: {
    [key: string]: string;
  };
  workflows?: Pick<WorkflowsProps, "orchestrator">;
}

export class Service extends Construct implements IGrantable {
  /**
   * Name of this Service.
   */
  public readonly serviceName: string;
  /**
   * The {@link AppSec} inferred from the application code.
   */
  public readonly appSpec: AppSpec;
  /**
   * This {@link Service}'s API Gateway.
   */
  public readonly api: Api;

  public readonly events: Events;
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
  public readonly scheduler: Scheduler;
  /**
   * The Resources for schedules and sleep timers.
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

  constructor(scope: Construct, id: string, props: ServiceProps) {
    super(scope, id);

    this.serviceName = props.name ?? Names.uniqueResourceName(this, {});

    this.appSpec = inferSync(props.entry);

    bundleSourcesSync(
      outDir(this),
      props.entry,
      {
        name: ServiceType.OrchestratorWorker,
        entry: runtimeHandlersEntrypoint("orchestrator"),
        eventualTransform: true,
        serviceType: ServiceType.OrchestratorWorker,
      },
      {
        name: ServiceType.ActivityWorker,
        entry: runtimeHandlersEntrypoint("activity-worker"),
        serviceType: ServiceType.ActivityWorker,
      },
      {
        name: ServiceType.ApiHandler,
        entry: runtimeHandlersEntrypoint("api-handler"),
        serviceType: ServiceType.ApiHandler,
      },
      {
        name: ServiceType.EventHandler,
        entry: runtimeHandlersEntrypoint("event-handler"),
        serviceType: ServiceType.EventHandler,
      }
    );

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

    this.logging = new Logging(this, "logging");

    this.events = new Events(this, "Events", {
      appSpec: this.appSpec,
      serviceName: this.serviceName,
      environment: props.environment,
      workflows: proxyWorkflows,
      activities: proxyActivities,
    });

    this.activities = new Activities(this, "Activities", {
      scheduler: proxyScheduler,
      workflows: proxyWorkflows,
      environment: props.environment,
      events: this.events,
    });
    proxyActivities._bind(this.activities);

    this.workflows = new Workflows(this, "Workflows", {
      scheduler: proxyScheduler,
      activities: this.activities,
      table: this.table,
      events: this.events,
      logging: this.logging,
      ...props.workflows,
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
      activities: this.activities,
      workflows: this.workflows,
      events: this.events,
      scheduler: this.scheduler,
      entry: props.entry,
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
        eventBusArn: this.events.bus.eventBusArn,
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

  public grantStartExecution(grantable: IGrantable) {
    this.workflows.grantSubmitWorkflowEvent(grantable);
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

  /**
   * The time taken to run the workflow's function to advance execution of the workflow.
   *
   * This does not include the time taken to invoke commands or save history. It is
   * purely a metric for how well the workflow's function is performing as history grows.
   */
  public metricAdvanceExecutionDuration(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: OrchestratorMetrics.AdvanceExecutionDuration,
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  /**
   * The number of commands invoked in a single batch by the orchestrator.
   */
  public metricCommandsInvoked(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: OrchestratorMetrics.CommandsInvoked,
      unit: Unit.COUNT,
      ...options,
    });
  }

  /**
   * The time taken to invoke all Commands emitted by advancing a workflow.
   */
  public metricInvokeCommandsDuration(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: OrchestratorMetrics.InvokeCommandsDuration,
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  /**
   * Time taken to download an execution's history from S3.
   */
  public metricLoadHistoryDuration(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: OrchestratorMetrics.LoadHistoryDuration,
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  /**
   * Time taken to save an execution's history to S3.
   */
  public metricSaveHistoryDuration(options?: MetricOptions): Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: OrchestratorMetrics.SaveHistoryDuration,
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  /**
   * The size of the history S3 file in bytes.
   */
  public metricSavedHistoryBytes(options?: MetricOptions): Metric {
    return this.metric({
      metricName: OrchestratorMetrics.SavedHistoryBytes,
      unit: Unit.BYTES,
      statistic: Statistic.AVERAGE,
      ...options,
    });
  }

  /**
   * The number of events stored in the history S3 file.
   */
  public metricSavedHistoryEvents(options?: MetricOptions): Metric {
    return this.metric({
      metricName: OrchestratorMetrics.SavedHistoryEvents,
      unit: Unit.COUNT,
      statistic: Statistic.AVERAGE,
      ...options,
    });
  }

  /**
   * The number of commands invoked in a single batch by the orchestrator.
   */
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
        [MetricsCommon.WorkflowNameDimension]: this.serviceName,
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
