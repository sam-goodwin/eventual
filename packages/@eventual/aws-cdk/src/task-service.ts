import { ENV_NAMES, taskServiceFunctionSuffix } from "@eventual/aws-runtime";
import type { TaskFunction } from "@eventual/core-runtime";
import { AttributeType, BillingMode, ITable } from "aws-cdk-lib/aws-dynamodb";
import aws_iam, { IGrantable, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Function, FunctionProps } from "aws-cdk-lib/aws-lambda";
import { LambdaDestination } from "aws-cdk-lib/aws-lambda-destinations";
import { Duration, Stack } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import type { BuildOutput } from "./build";
import { DeepCompositePrincipal } from "./deep-composite-principal";
import { grant } from "./grant";
import type { LazyInterface } from "./proxy-construct";
import { EventualResource } from "./resource";
import type { SchedulerService } from "./scheduler-service";
import { SecureTable } from "./secure/table";
import type { ServiceLocal } from "./service";
import {
  WorkerServiceConstructProps,
  configureWorkerCalls,
} from "./service-common";
import { ServiceFunction } from "./service-function";
import { ServiceEntityProps, serviceFunctionArn } from "./utils";
import type { WorkflowService } from "./workflow-service";

export type ServiceTasks<Service> = ServiceEntityProps<Service, "Task", Task>;

export type TaskOverrides<Service> = {
  default?: TaskHandlerProps;
} & Partial<ServiceEntityProps<Service, "Task", TaskHandlerProps>>;

export interface TasksProps<Service> extends WorkerServiceConstructProps {
  readonly local: ServiceLocal | undefined;
  readonly overrides?: TaskOverrides<Service>;
  readonly schedulerService: LazyInterface<SchedulerService>;
  readonly workflowService: LazyInterface<WorkflowService>;
}

/**
 * Subsystem which supports durable tasks.
 *
 * Tasks are started by the {@link Workflow.orchestrator} and send back {@link WorkflowEvent}s on completion.
 */
export class TaskService<Service = any> {
  /**
   * Table which contains task information for claiming, heartbeat, and cancellation.
   */
  public table: ITable;
  /**
   * Function which executes all tasks. The worker is invoked by the {@link WorkflowService.orchestrator}.
   */
  public tasks: ServiceTasks<Service>;
  /**
   * Function which is executed when a task worker returns a failure.
   */
  public fallbackHandler: Function;

  constructor(private props: TasksProps<Service>) {
    const taskServiceScope = new Construct(props.systemScope, "TaskService");

    this.table = new SecureTable(taskServiceScope, "Table", {
      compliancePolicy: props.compliancePolicy,
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
    });

    this.fallbackHandler = new ServiceFunction(
      taskServiceScope,
      "FallbackHandler",
      {
        bundledFunction: props.build.system.taskService.fallbackHandler,
        build: props.build,
        functionNameSuffix: taskServiceFunctionSuffix(
          `internal-fallback-handler`
        ),
        serviceName: props.serviceName,
      }
    );

    const taskScope = new Construct(props.serviceScope, "Tasks");
    this.tasks = Object.fromEntries(
      props.build.tasks.map((t) => {
        const task = new Task(taskScope, t.spec.name, {
          task: t,
          build: props.build,
          codeFile: t.entry,
          fallbackHandler: this.fallbackHandler,
          serviceName: this.props.serviceName,
          environment: this.props.environment,
          overrides:
            props.overrides?.[
              t.spec.name as keyof ServiceEntityProps<
                Service,
                "Task",
                TaskHandlerProps
              >
            ],
          local: this.props.local,
        });

        this.configureTaskWorker(task.handler);

        return [t.spec.name, task] as const;
      })
    ) as ServiceTasks<Service>;

    this.configureTaskFallbackHandler();
  }

  /**
   * Task Client
   */

  public configureStartTask(func: Function) {
    this.grantStartTask(func);
  }

  @grant()
  public grantStartTask(grantable: IGrantable) {
    // grants the permission to start any task
    grantable.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [
          serviceFunctionArn(
            this.props.serviceName,
            Stack.of(this.props.systemScope),
            "task-*",
            false
          ),
          serviceFunctionArn(
            this.props.serviceName,
            Stack.of(this.props.systemScope),
            "task-*:*",
            false
          ),
        ],
      })
    );
  }

  public configureSendHeartbeat(func: Function) {
    this.props.workflowService.configureReadExecutions(func);
    this.configureWriteTasks(func);
  }

  @grant()
  public grantSendHeartbeat(grantable: IGrantable) {
    this.props.workflowService.grantReadExecutions(grantable);
    this.grantWriteTasks(grantable);
  }

  public configureCompleteTask(func: Function) {
    this.props.workflowService.configureSubmitExecutionEvents(func);
    this.grantCompleteTask(func);
  }

  @grant()
  public grantCompleteTask(grantable: IGrantable) {
    this.props.workflowService.grantSubmitExecutionEvents(grantable);
  }

  /**
   * Task Store Configuration
   */

  public configureReadTasks(func: Function) {
    this.grantReadTasks(func);
    this.addEnvs(func, ENV_NAMES.TASK_TABLE_NAME);
  }

  @grant()
  public grantReadTasks(grantable: IGrantable) {
    this.table.grantReadData(grantable);
  }

  public configureWriteTasks(func: Function) {
    this.grantWriteTasks(func);
    this.addEnvs(func, ENV_NAMES.TASK_TABLE_NAME);
  }

  @grant()
  public grantWriteTasks(grantable: IGrantable) {
    this.table.grantWriteData(grantable);
  }

  public configureFullControl(func: Function): void {
    this.configureStartTask(func);
    this.configureSendHeartbeat(func);
    this.configureCompleteTask(func);
    this.configureReadTasks(func);
    this.configureWriteTasks(func);
  }

  @grant()
  public grantFullControl(grantable: IGrantable): void {
    this.grantStartTask(grantable);
    this.grantSendHeartbeat(grantable);
    this.grantCompleteTask(grantable);
    this.grantReadTasks(grantable);
    this.grantWriteTasks(grantable);
  }

  private configureTaskWorker(func: Function) {
    // claim tasks
    this.configureWriteTasks(func);
    configureWorkerCalls(this.props, func);
    // report result back to the execution
    this.props.workflowService.configureSubmitExecutionEvents(func);
    // send logs to the execution log stream
    this.props.workflowService.configurePutWorkflowExecutionLogs(func);
    // start heartbeat monitor
    this.props.schedulerService.configureScheduleTimer(func);
    // access the runtime service client
    this.props.service.configureForServiceClient(func);

    this.props.service.configureServiceName(func);
  }

  private configureTaskFallbackHandler() {
    // report result back to the execution
    this.props.workflowService.configureSubmitExecutionEvents(
      this.fallbackHandler
    );
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.TASK_TABLE_NAME]: () => this.table.tableName,
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}

export type TaskHandlerProps = Omit<
  Partial<FunctionProps>,
  "code" | "handler" | "functionName" | "onFailure" | "retryAttempts"
>;

export interface TaskProps {
  build: BuildOutput;
  task: TaskFunction;
  codeFile: string;
  environment?: Record<string, string>;
  serviceName: string;
  fallbackHandler: Function;
  overrides?: TaskHandlerProps;
  local?: ServiceLocal;
}

export class Task extends Construct implements EventualResource {
  public handler: Function;
  public grantPrincipal: aws_iam.IPrincipal;

  constructor(scope: Construct, id: string, props: TaskProps) {
    super(scope, id);

    this.handler = new ServiceFunction(this, "Worker", {
      build: props.build,
      serviceName: props.serviceName,
      bundledFunction: props.task,
      functionNameSuffix: taskServiceFunctionSuffix(props.task.spec.name),
      defaults: {
        timeout: Duration.minutes(1),
        // retry attempts should be handled with a new request and a new retry count in accordance with the user's retry policy.
        retryAttempts: 0,
        // handler and recovers from error cases
        onFailure: new LambdaDestination(props.fallbackHandler),
        environment: props.environment,
      },
      runtimeProps: props.task.spec.options,
      overrides: props.overrides,
    });

    // TODO: Dead Letter Queue?

    this.grantPrincipal = props.local
      ? new DeepCompositePrincipal(
          props.local.environmentRole,
          this.handler.grantPrincipal
        )
      : this.handler.grantPrincipal;
  }
}
