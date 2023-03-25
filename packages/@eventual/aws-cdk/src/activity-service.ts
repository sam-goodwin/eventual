import {
  activityServiceFunctionSuffix,
  ENV_NAMES,
} from "@eventual/aws-runtime";
import type { ActivityFunction } from "@eventual/core-runtime";
import { aws_iam, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  ITable,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { IGrantable, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { LambdaDestination } from "aws-cdk-lib/aws-lambda-destinations";
import { Construct } from "constructs";
import type { BuildOutput } from "./build";
import { CommandService } from "./command-service";
import { DeepCompositePrincipal } from "./deep-composite-principal";
import { EntityService } from "./entity-service";
import { grant } from "./grant";
import { LazyInterface } from "./proxy-construct";
import { SchedulerService } from "./scheduler-service";
import {
  EventualResource,
  ServiceConstructProps,
  ServiceLocal,
} from "./service";
import { ServiceFunction } from "./service-function";
import {
  GetServiceEntityNames,
  ServiceEntityProps,
  serviceFunctionArn,
} from "./utils";
import { WorkflowService } from "./workflow-service";

export type ActivityNames<Service> = GetServiceEntityNames<Service, "Activity">;

export type ServiceActivities<Service> = ServiceEntityProps<
  Service,
  "Activity",
  Activity
>;

export type ActivityOverrides<Service> = {
  default?: ActivityHandlerProps;
} & Partial<ServiceEntityProps<Service, "Activity", ActivityHandlerProps>>;

export interface ActivitiesProps<Service> extends ServiceConstructProps {
  readonly commandsService: LazyInterface<CommandService<Service>>;
  readonly entityService: EntityService;
  readonly local: ServiceLocal | undefined;
  readonly overrides?: ActivityOverrides<Service>;
  readonly schedulerService: LazyInterface<SchedulerService>;
  readonly workflowService: LazyInterface<WorkflowService>;
}

/**
 * Subsystem which supports durable activities.
 *
 * Activities are started by the {@link Workflow.orchestrator} and send back {@link WorkflowEvent}s on completion.
 */
export class ActivityService<Service = any> {
  /**
   * Table which contains activity information for claiming, heartbeat, and cancellation.
   */
  public table: ITable;
  /**
   * Function which executes all activities. The worker is invoked by the {@link WorkflowService.orchestrator}.
   */
  public activities: ServiceActivities<Service>;
  /**
   * Function which is executed when an activity worker returns a failure.
   */
  public fallbackHandler: Function;

  constructor(private props: ActivitiesProps<Service>) {
    const activityServiceScope = new Construct(
      props.systemScope,
      "ActivityService"
    );

    this.table = new Table(activityServiceScope, "Table", {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.fallbackHandler = new ServiceFunction(
      activityServiceScope,
      "FallbackHandler",
      {
        bundledFunction: props.build.system.activityService.fallbackHandler,
        build: props.build,
        functionNameSuffix: activityServiceFunctionSuffix(
          `internal-fallback-handler`
        ),
        serviceName: props.serviceName,
      }
    );

    const activityScope = new Construct(props.serviceScope, "Activities");
    this.activities = Object.fromEntries(
      props.build.activities.map((act) => {
        const activity = new Activity(activityScope, act.spec.name, {
          activity: act,
          build: props.build,
          codeFile: act.entry,
          fallbackHandler: this.fallbackHandler,
          serviceName: this.props.serviceName,
          environment: this.props.environment,
          overrides:
            props.overrides?.[
              act.spec.name as keyof ServiceEntityProps<
                Service,
                "Activity",
                ActivityHandlerProps
              >
            ],
          local: this.props.local,
        });

        this.configureActivityWorker(activity.handler);

        return [act.spec.name, activity] as const;
      })
    ) as ServiceActivities<Service>;

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
    // grants the permission to start any activity
    grantable.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [
          serviceFunctionArn(
            this.props.serviceName,
            Stack.of(this.props.systemScope),
            "activity-*",
            false
          ),
          serviceFunctionArn(
            this.props.serviceName,
            Stack.of(this.props.systemScope),
            "activity-*:*",
            false
          ),
        ],
      })
    );
  }

  public configureSendHeartbeat(func: Function) {
    this.props.workflowService.configureReadExecutions(func);
    this.configureWriteActivities(func);
  }

  @grant()
  public grantSendHeartbeat(grantable: IGrantable) {
    this.props.workflowService.grantReadExecutions(grantable);
    this.grantWriteActivities(grantable);
  }

  public configureCompleteActivity(func: Function) {
    this.props.workflowService.configureSubmitExecutionEvents(func);
    this.grantCompleteActivity(func);
  }

  @grant()
  public grantCompleteActivity(grantable: IGrantable) {
    this.props.workflowService.grantSubmitExecutionEvents(grantable);
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
    this.props.workflowService.configureSubmitExecutionEvents(func);
    // send logs to the execution log stream
    this.props.workflowService.configurePutWorkflowExecutionLogs(func);
    // start heartbeat monitor
    this.props.schedulerService.configureScheduleTimer(func);

    // allows access to any of the injected service client operations.
    this.props.service.configureForServiceClient(func);
    this.props.commandsService.configureInvokeHttpServiceApi(func);
    /**
     * Access to service name in the activity worker for metrics logging
     */
    this.props.service.configureServiceName(func);
    /**
     * Dictionary operations
     */
    this.props.entityService.configureReadWriteEntityTable(func); 
  }

  private configureActivityFallbackHandler() {
    // report result back to the execution
    this.props.workflowService.configureSubmitExecutionEvents(
      this.fallbackHandler
    );
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
    "code" | "handler" | "functionName" | "onFailure" | "retryAttempts"
  > {}

export interface ActivityProps {
  build: BuildOutput;
  activity: ActivityFunction;
  codeFile: string;
  environment?: Record<string, string>;
  serviceName: string;
  fallbackHandler: Function;
  overrides?: ActivityHandlerProps;
  local?: ServiceLocal;
}

export class Activity extends Construct implements EventualResource {
  public handler: Function;
  public grantPrincipal: aws_iam.IPrincipal;

  constructor(scope: Construct, id: string, props: ActivityProps) {
    super(scope, id);

    this.handler = new ServiceFunction(this, "Worker", {
      build: props.build,
      serviceName: props.serviceName,
      bundledFunction: props.activity,
      functionNameSuffix: activityServiceFunctionSuffix(
        props.activity.spec.name
      ),
      defaults: {
        timeout: Duration.minutes(1),
        // retry attempts should be handled with a new request and a new retry count in accordance with the user's retry policy.
        retryAttempts: 0,
        // handler and recovers from error cases
        onFailure: new LambdaDestination(props.fallbackHandler),
        environment: props.environment,
      },
      runtimeProps: props.activity.spec.options,
      overrides: props.overrides,
    });

    this.grantPrincipal = props.local
      ? new DeepCompositePrincipal(
          props.local.environmentRole,
          this.handler.grantPrincipal
        )
      : this.handler.grantPrincipal;
  }
}
