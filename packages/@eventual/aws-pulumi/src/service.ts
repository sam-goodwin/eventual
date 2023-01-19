import { ExecutionRecord } from "@eventual/aws-runtime";
import { AppSpec, Event, ServiceType } from "@eventual/core";
import { getRegion } from "@pulumi/aws";
import { getAccountAlias } from "@pulumi/aws/iam";
import {
  ComponentResource,
  ComponentResourceOptions,
  Output,
  ResourceOptions,
} from "@pulumi/pulumi";
import { Activities } from "./activities";
import { Api } from "./api";
import { Function } from "./aws/function";
import { CompositePrincipal, IGrantable, IPrincipal } from "./aws/grantable";
import { Parameter } from "./aws/parameter";
import { Role } from "./aws/role";
import { Rule } from "./aws/rule";
import { Table } from "./aws/table";
import { bundleSources, infer } from "./compile-client";
import { Events } from "./events";
import { Logging, LoggingProps } from "./logging";
import { lazyInterface } from "./proxy-construct";
import { Scheduler } from "./scheduler";
import { outDir, runtimeHandlersEntrypoint } from "./utils";
import { Workflows, WorkflowsProps } from "./workflows";

/**
 * The properties for subscribing a Service to another Service's events.
 *
 * @see Service.subscribe
 */
export interface SubscribeProps {
  /**
   * The {@link Service} to subscribe to.
   */
  service: Service;
  /**
   * The events to subscribe to. Can specify a string or a reference to an {@link Event}.
   */
  events: (Event | string)[];
}

export interface ServiceProps {
  /**
   * The path of the `.ts` or `.js` file that is the entrypoint to the Service's logic.
   */
  entry: string;
  /**
   * Name of the {@link Service}. This is the name that will be
   */
  name: string;
  /**
   * Environment variables to include in all API, Event and Activity handler Functions.
   */
  environment?: {
    [key: string]: string;
  };
  /**
   * Override the workflow dependencies of a Service {@link WorkflowsProps}
   *
   * @default - the dependencies are created.
   * @see WorkflowsProps
   */
  workflows?: Pick<WorkflowsProps, "orchestrator">;
  logging?: Omit<LoggingProps, "serviceName">;
}

export class Service extends ComponentResource {
  /**
   * Name of this Service.
   */
  public readonly serviceName: string;
  /**
   * The {@link AppSec} inferred from the application code.
   */
  public readonly appSpec: Promise<AppSpec>;
  /**
   * This {@link Service}'s API Gateway.
   */
  public readonly api: Api;
  /**
   * This {@link Service}'s {@link Events} that can be published and subscribed to.
   */
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
  public readonly serviceDataSSM: Parameter;
  /**
   * The resources used to facilitate service logging.
   */
  public readonly logging: Logging;

  /**
   * Directory where the Service's compiled artifacts are stored.
   */
  readonly outDir: Output<string>;

  readonly grantPrincipal: IPrincipal;

  constructor(
    name: string,
    props: ServiceProps,
    options?: ComponentResourceOptions
  ) {
    super("eventual:Service", name, {}, options);

    this.serviceName = props.name;

    this.appSpec = infer(props.entry);

    this.outDir = outDir(this);

    const bundle = this.outDir.apply((p) =>
      bundleSources(
        p,
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
        },
        {
          name: "SchedulerForwarder",
          entry: runtimeHandlersEntrypoint("schedule-forwarder"),
        },
        {
          name: "SchedulerHandler",
          entry: runtimeHandlersEntrypoint("timer-handler"),
        }
      )
    );
    this.registerOutputs(bundle);

    this.table = new Table(
      "Table",
      {
        hashKey: "pk",
        rangeKey: "sk",
        attributes: [
          {
            name: "pk",
            type: "S",
          },
          {
            name: "sk",
            type: "S",
          },
        ],
        billingMode: "PAY_PER_REQUEST",
        localSecondaryIndexes: [
          {
            name: ExecutionRecord.START_TIME_SORTED_INDEX,
            rangeKey: ExecutionRecord.START_TIME,
            projectionType: "ALL",
          },
        ],
      },
      { parent: this }
    );

    this.logging = new Logging(
      "Logging",
      {
        serviceName: this.serviceName,
      },
      {
        parent: this,
      }
    );

    const proxyScheduler = lazyInterface<Scheduler>();
    const proxyWorkflows = lazyInterface<Workflows>();
    const proxyActivities = lazyInterface<Activities>();

    this.events = new Events(
      "Events",
      {
        appSpec: this.appSpec,
        serviceName: this.serviceName,
        environment: props.environment,
        workflows: proxyWorkflows,
        activities: proxyActivities,
      },
      {
        parent: this,
      }
    );

    this.activities = new Activities(
      "Activities",
      {
        serviceName: this.serviceName,
        scheduler: proxyScheduler,
        workflows: proxyWorkflows,
        environment: props.environment,
        events: this.events,
        logging: this.logging,
      },
      {
        parent: this,
      }
    );
    proxyActivities._bind(this.activities);

    this.workflows = new Workflows(
      "Workflows",
      {
        serviceName: this.serviceName,
        scheduler: proxyScheduler,
        activities: this.activities,
        table: this.table,
        events: this.events,
        logging: this.logging,
        ...props.workflows,
      },
      {
        parent: this,
      }
    );
    proxyWorkflows._bind(this.workflows);

    this.scheduler = new Scheduler(
      "Scheduler",
      {
        workflows: this.workflows,
        activities: this.activities,
        logging: this.logging,
      },
      {
        parent: this,
      }
    );
    proxyScheduler._bind(this.scheduler);

    this.api = new Api(
      "Api",
      {
        serviceName: this.serviceName,
        environment: props.environment,
        activities: this.activities,
        workflows: this.workflows,
        events: this.events,
        scheduler: this.scheduler,
        entry: props.entry,
      },
      {
        parent: this,
      }
    );

    this.grantPrincipal = new CompositePrincipal([
      // when granting permissions to the service,
      // propagate them to the following principals
      this.activities.worker.grantPrincipal,
      this.api.handler.grantPrincipal,
    ]);

    this.cliRole = new Role(
      "EventualCliRole",
      {
        name: `eventual-cli-${this.serviceName}`,
        assumeRolePolicy: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "sts:AssumeRole",
              Resource: getAccountAlias().then(
                (accountId) => `arn:aws:iam::${accountId.accountAlias}:root`
              ) as Promise<string>,
            },
          ],
        },
      },
      {
        parent: this,
      }
    );
    this.grantFilterLogEvents(this.cliRole);
    this.api.grantExecute(this.cliRole);
    this.logging.grantFilterLogEvents(this.cliRole);

    this.serviceDataSSM = new Parameter(
      "service-data",
      {
        type: "String",
        name: `/eventual/services/${this.serviceName}`,
        value: JSON.stringify({
          apiEndpoint: this.api.gateway.apiEndpoint,
          eventBusArn: this.events.bus.arn,
          logGroupName: this.logging.logGroup.logGroupName,
        }),
      },
      {
        parent: this,
      }
    );

    this.serviceDataSSM.grantRead(this.cliRole);
  }

  /**
   * Subscribe this {@link Service} to another {@link Service}'s events.
   *
   * An Event Bridge {@link aws_events.Rule} will be created to route all events
   * that match the {@link SubscribeProps.events}.
   *
   * @param props the {@link SubscribeProps} specifying the service and events to subscribe to
   */
  public subscribe(
    id: string,
    props: SubscribeProps,
    opts?: ResourceOptions
  ): Rule {
    return new Rule(
      id,
      {
        eventBusName: props.service.events.bus.name,
        eventPattern: JSON.stringify({
          "detail-type": props.events.map((event) =>
            typeof event === "string" ? event : event.name
          ),
        }),

        // targets: [new aws_events_targets.EventBus(this.events.bus)],
      },
      opts ?? {
        parent: this,
      }
    );
  }

  /**
   * Add an environment variable to the Activity, API, Event and Workflow handler Functions.
   *
   * @param key The environment variable key.
   * @param value The environment variable's value.
   */
  public addEnvironment(key: string, value: string): void {
    this.activities.worker.addEnvironment(key, value);
    this.api.handler.addEnvironment(key, value);
    this.events.handler.addEnvironment(key, value);
    this.workflows.orchestrator.addEnvironment(key, value);
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
  public static grantDescribeParameters(grantable: IGrantable) {
    grantable.grantPrincipal.addToPrincipalPolicy({
      Effect: "Allow",
      Action: ["ssm:DescribeParameters"],
      // arn:aws:ssm:us-east-2:111222333444:parameter/MyStringParameter
      Resource: Promise.all([getAccountAlias(), getRegion()]).then(
        ([account, region]) =>
          `arn:aws:ssm:${region.name}:${account.accountAlias}:parameter/eventual/services`
      ) as Promise<string>,
    });
  }
}
