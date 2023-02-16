import {
  activityServiceFunctionSuffix,
  ENV_NAMES,
} from "@eventual/aws-runtime";
import { aws_iam, Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  ITable,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { LambdaDestination } from "aws-cdk-lib/aws-lambda-destinations";
import { Construct } from "constructs";
import type { BuildOutput } from "./build";
import { ActivityFunction } from "./build-manifest";
import { Events } from "./events";
import { grant } from "./grant";
import { Logging } from "./logging";
import { IScheduler } from "./scheduler";
import { IService } from "./service";
import { IServiceApi } from "./service-api";
import { ServiceFunction } from "./service-function";
import { KeysOfType } from "./utils";
import { IWorkflows } from "./workflows";

export interface ActivitiesProps {
  build: BuildOutput;
  serviceName: string;
  workflows: IWorkflows;
  scheduler: IScheduler;
  environment?: Record<string, string>;
  events: Events;
  logging: Logging;
  service: IService;
  readonly api: IServiceApi;
}

export interface IActivities {
  configureStartActivity(func: Function): void;
  grantStartActivity(grantable: IGrantable): void;

  configureSendHeartbeat(func: Function): void;
  grantSendHeartbeat(grantable: IGrantable): void;

  /**
   * {@link ActivitiesClient.sendSuccess} or {@link ActivitiesClient.sendFailure} for an activity.
   */
  configureCompleteActivity(func: Function): void;
  /**
   * {@link ActivitiesClient.sendSuccess} or {@link ActivitiesClient.sendFailure} for an activity.
   */
  grantCompleteActivity(grantable: IGrantable): void;

  configureReadActivities(func: Function): void;
  grantReadActivities(grantable: IGrantable): void;

  /**
   * Claim, Heartbeat, or Cancel an activity.
   *
   * Note: For the full heartbeat, use grantSendHeartbeat.
   */
  configureWriteActivities(func: Function): void;
  /**
   * Claim, Heartbeat, or Cancel an activity.
   *
   * Note: For the full heartbeat, use grantSendHeartbeat.
   */
  grantWriteActivities(grantable: IGrantable): void;

  configureFullControl(func: Function): void;
  grantFullControl(grantable: IGrantable): void;
}

export type ActivityNames<Service> = KeysOfType<
  Service,
  { kind: "Activities" }
>;

/**
 * Subsystem which supports durable activities.
 *
 * Activities are started by the {@link Workflow.orchestrator} and send back {@link WorkflowEvent}s on completion.
 */
export class Activities<Service> extends Construct implements IActivities {
  /**
   * Table which contains activity information for claiming, heartbeat, and cancellation.
   */
  public table: ITable;
  /**
   * Function which executes all activities. The worker is invoked by the {@link Workflows.orchestrator}.
   */
  public activities: Record<
    keyof Pick<Service, ActivityNames<Service>>,
    Activity
  >;
  /**
   * Function which is executed when an activity worker returns a failure.
   */
  public fallbackHandler: Function;

  constructor(scope: Construct, id: string, private props: ActivitiesProps) {
    super(scope, id);
    this.table = new Table(this, "Table", {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.fallbackHandler = new ServiceFunction(this, "FallbackHandler", {
      bundledFunction: props.build.internal.activities.fallbackHandler,
      build: props.build,
      functionNameSuffix: `activity-fallback-handler`,
      serviceName: props.serviceName,
    });

    const activityScope = new Construct(this, "Activities");
    this.activities = Object.fromEntries(
      Object.entries(props.build.activities).map(([name, act]) => {
        const activity = new Activity(activityScope, act.spec.activityID, {
          activity: act,
          build: props.build,
          codeFile: act.file,
          fallbackHandler: this.fallbackHandler,
          serviceName: this.props.serviceName,
          environment: this.props.environment,
        });

        this.configureActivityWorker(activity.handler);

        return [name, activity];
      })
    ) as Record<keyof Pick<Service, ActivityNames<Service>>, Activity>;

    this.configureActivityFallbackHandler();
  }

  /**
   * Activity Client
   */

  public configureStartActivity(func: Function) {
    this.grantStartActivity(func);
  }

  @grant()
  public grantStartActivity(grantable: IGrantable) {
    Object.values<Activity>(this.activities).map((a) => {
      a.handler.grantInvoke(grantable);
    });
  }

  public configureSendHeartbeat(func: Function) {
    this.props.workflows.configureReadExecutions(func);
    this.configureWriteActivities(func);
  }

  @grant()
  public grantSendHeartbeat(grantable: IGrantable) {
    this.props.workflows.grantReadExecutions(grantable);
    this.grantWriteActivities(grantable);
  }

  public configureCompleteActivity(func: Function) {
    this.props.workflows.configureSubmitExecutionEvents(func);
    this.grantCompleteActivity(func);
  }

  @grant()
  public grantCompleteActivity(grantable: IGrantable) {
    this.props.workflows.grantSubmitExecutionEvents(grantable);
  }

  /**
   * Activity Store Configuration
   */

  public configureReadActivities(func: Function) {
    this.grantReadActivities(func);
    this.addEnvs(func, ENV_NAMES.ACTIVITY_TABLE_NAME);
  }

  @grant()
  public grantReadActivities(grantable: IGrantable) {
    this.table.grantReadData(grantable);
  }

  public configureWriteActivities(func: Function) {
    this.grantWriteActivities(func);
    this.addEnvs(func, ENV_NAMES.ACTIVITY_TABLE_NAME);
  }

  @grant()
  public grantWriteActivities(grantable: IGrantable) {
    this.table.grantWriteData(grantable);
  }

  public configureFullControl(func: Function): void {
    this.configureStartActivity(func);
    this.configureSendHeartbeat(func);
    this.configureCompleteActivity(func);
    this.configureReadActivities(func);
    this.configureWriteActivities(func);
  }

  @grant()
  public grantFullControl(grantable: IGrantable): void {
    this.grantStartActivity(grantable);
    this.grantSendHeartbeat(grantable);
    this.grantCompleteActivity(grantable);
    this.grantReadActivities(grantable);
    this.grantWriteActivities(grantable);
  }

  private configureActivityWorker(func: Function) {
    // claim activities
    this.configureWriteActivities(func);
    // report result back to the execution
    this.props.workflows.configureSubmitExecutionEvents(func);
    // send logs to the execution log stream
    this.props.logging.configurePutServiceLogs(func);
    // start heartbeat monitor
    this.props.scheduler.configureScheduleTimer(func);

    // allows access to any of the injected service client operations.
    this.props.service.configureForServiceClient(func);
    this.props.api.configureInvokeHttpServiceApi(func);
    /**
     * Access to service name in the activity worker for metrics logging
     */
    this.props.service.configureServiceName(func);
  }

  private configureActivityFallbackHandler() {
    // report result back to the execution
    this.props.workflows.configureSubmitExecutionEvents(this.fallbackHandler);
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.ACTIVITY_TABLE_NAME]: () => this.table.tableName,
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}

export interface ActivityHandlerProps
  extends Omit<
    Partial<FunctionProps>,
    "code" | "handler" | "functionName" | "onFailure"
  > {}

export interface ActivityProps {
  build: BuildOutput;
  activity: ActivityFunction;
  codeFile: string;
  environment?: Record<string, string>;
  serviceName: string;
  fallbackHandler: Function;
}

export class Activity extends Construct implements IGrantable {
  public handler: Function;
  public grantPrincipal: aws_iam.IPrincipal;

  constructor(scope: Construct, id: string, props: ActivityProps) {
    super(scope, id);

    this.handler = new ServiceFunction(this, "Worker", {
      build: props.build,
      bundledFunction: props.activity,
      functionNameSuffix: activityServiceFunctionSuffix(
        props.activity.spec.activityID
      ),
      overrides: {
        // retry attempts should be handled with a new request and a new retry count in accordance with the user's retry policy.
        retryAttempts: 0,
        // handler and recovers from error cases
        onFailure: new LambdaDestination(props.fallbackHandler),
        timeout: Duration.minutes(1),
      },
      serviceName: props.serviceName,
      environment: props.environment,
      runtimeProps: props.activity.spec.options,
    });

    this.grantPrincipal = this.handler.grantPrincipal;
  }
}
