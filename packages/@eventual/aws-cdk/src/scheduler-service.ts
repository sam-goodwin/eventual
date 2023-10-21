import { ENV_NAMES } from "@eventual/aws-runtime";
import {
  IGrantable,
  IRole,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { CfnScheduleGroup } from "aws-cdk-lib/aws-scheduler";
import { IQueue, Queue } from "aws-cdk-lib/aws-sqs";
import { ArnFormat, Resource, Stack } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { grant } from "./grant";
import { LazyInterface } from "./proxy-construct";
import { SecureQueue } from "./secure/queue";
import { ServiceConstructProps } from "./service-common";
import { ServiceFunction } from "./service-function";
import type { TaskService } from "./task-service.js";
import { serviceFunctionArn } from "./utils";
import { WorkflowService } from "./workflow-service";

export interface SchedulerProps extends ServiceConstructProps {
  /**
   * Workflow controller represent the ability to control the workflow, including starting the workflow
   * sending signals, and more.
   */
  workflowService: LazyInterface<WorkflowService>;
  /**
   * Used by the task heartbeat monitor to retrieve heartbeat data.
   */
  taskService: LazyInterface<TaskService>;
}

/**
 * Subsystem that orchestrates long running timers. Used to orchestrate timeouts, timers
 * and heartbeats.
 */
export class SchedulerService {
  /**
   * The Scheduler's IAM Role.
   */
  public readonly schedulerRole: IRole;
  /**
   * Timer (standard) queue which helps orchestrate scheduled things like timers, heartbeat, and dynamic retries.
   *
   * Worths in tandem with the {@link CfnSchedulerGroup} to create millisecond latency, long running timers.
   */
  public readonly queue: IQueue;
  /**
   * A group in which all of the workflow schedules are created under.
   */
  public readonly schedulerGroup: ScheduleGroup;
  /**
   * The lambda function which executes timed requests on the timerQueue.
   */
  public readonly handler: Function;
  /**
   * Forwards long running timers from the EventBridge schedules to the timer queue.
   *
   * The Timer Queue supports <15m timers at a sub second accuracy, the EventBridge schedule
   * support arbitrary length events at a sub minute accuracy.
   */
  public readonly forwarder: Function;
  /**
   * A common Dead Letter Queue to handle failures from various places.
   *
   * Timers - When the EventBridge scheduler fails to invoke the Schedule Forwarder Lambda.
   */
  public readonly dlq: Queue;

  constructor(private props: SchedulerProps) {
    const schedulerServiceScope = new Construct(
      props.systemScope,
      "SchedulerService"
    );

    this.schedulerGroup = new ScheduleGroup(
      schedulerServiceScope,
      "ScheduleGroup"
    );

    this.schedulerRole = new Role(schedulerServiceScope, "SchedulerRole", {
      assumedBy: new ServicePrincipal("scheduler.amazonaws.com", {
        conditions: {
          ArnEquals: {
            "aws:SourceArn": this.scheduleGroupWildCardArn,
          },
        },
      }),
    });

    this.dlq = new SecureQueue(schedulerServiceScope, "DeadLetterQueue", {
      compliancePolicy: props.compliancePolicy,
    });
    this.dlq.grantSendMessages(this.schedulerRole);

    this.queue = new SecureQueue(schedulerServiceScope, "Queue", {
      compliancePolicy: props.compliancePolicy,
    });

    // TODO: handle failures to a DLQ - https://github.com/functionless/eventual/issues/40
    this.forwarder = new ServiceFunction(schedulerServiceScope, "Forwarder", {
      build: props.build,
      bundledFunction: props.build.system.schedulerService.forwarder,
      functionNameSuffix: "scheduler-forwarder",
      serviceName: this.props.serviceName,
    });

    // Allow the scheduler to create workflow tasks.
    this.forwarder.grantInvoke(this.schedulerRole);

    this.handler = new ServiceFunction(schedulerServiceScope, "handler", {
      build: props.build,
      bundledFunction: props.build.system.schedulerService.timerHandler,
      functionNameSuffix: "scheduler-handler",
      serviceName: props.serviceName,
      overrides: {
        events: [
          new SqsEventSource(this.queue, {
            reportBatchItemFailures: true,
          }),
        ],
      },
    });

    this.configureScheduleForwarder();
    this.configureHandler();
  }

  public get grantPrincipal() {
    return this.handler.grantPrincipal;
  }

  public configureScheduleTimer(func: Function) {
    this.grantCreateTimer(func);
    this.configureSubmitToTimerQueue(func);
    this.addEnvs(
      func,
      ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN,
      ENV_NAMES.SCHEDULER_GROUP,
      ENV_NAMES.SCHEDULER_ROLE_ARN
    );
    this.schedulerRole.grantPassRole(func.grantPrincipal);
    if (func !== this.forwarder) {
      this.addEnvs(func, ENV_NAMES.SCHEDULE_FORWARDER_ARN);
    }
  }

  @grant()
  public grantCreateTimer(grantable: IGrantable) {
    this.grantSubmitToTimerQueue(grantable);
    grantable.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ["scheduler:CreateSchedule"],
        resources: [this.scheduleGroupWildCardArn],
      })
    );
  }

  private configureSubmitToTimerQueue(func: Function) {
    this.grantSubmitToTimerQueue(func);
    this.addEnvs(func, ENV_NAMES.TIMER_QUEUE_URL);
  }

  private grantSubmitToTimerQueue(grantable: IGrantable) {
    this.queue.grantSendMessages(grantable);
  }

  private configureCleanupTimer(func: Function) {
    this.grantCleanupTimer(func);
    this.addEnvs(func, ENV_NAMES.SCHEDULER_GROUP);
  }

  /**
   * Grants the ability for the forwarder to remove the schedule.
   */
  @grant()
  private grantCleanupTimer(grantable: IGrantable): any {
    grantable.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ["scheduler:DeleteSchedule"],
        resources: [this.scheduleGroupWildCardArn],
      })
    );
  }

  private get scheduleGroupWildCardArn() {
    return Stack.of(this.schedulerGroup).formatArn({
      service: "scheduler",
      resource: "schedule",
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      resourceName: `${this.schedulerGroup.ref}/*`,
    });
  }

  private configureHandler() {
    // to support the ScheduleEventRequest
    this.props.workflowService.configureSubmitExecutionEvents(this.handler);
    // to lookup task heartbeat time
    this.props.taskService.configureReadTasks(this.handler);
    // to re-schedule a new timer on heartbeat check success
    this.configureScheduleTimer(this.handler);
    // logs to the execution
    this.props.workflowService.configurePutWorkflowExecutionLogs(this.handler);
  }

  private configureScheduleForwarder() {
    // starts a short timer to forward the timer
    this.configureSubmitToTimerQueue(this.forwarder);
    // deletes the EB schedule
    this.configureCleanupTimer(this.forwarder);
    // logs to the execution when forwarding
    this.props.workflowService.configurePutWorkflowExecutionLogs(this.handler);
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.SCHEDULE_FORWARDER_ARN]: () =>
      serviceFunctionArn(
        this.props.serviceName,
        Stack.of(this.props.systemScope),
        "scheduler-forwarder"
      ),
    [ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN]: () => this.dlq.queueArn,
    [ENV_NAMES.SCHEDULER_GROUP]: () => this.schedulerGroup.ref,
    [ENV_NAMES.SCHEDULER_ROLE_ARN]: () => this.schedulerRole.roleArn,
    [ENV_NAMES.TIMER_QUEUE_URL]: () => this.queue.queueUrl,
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}

class ScheduleGroup extends Resource {
  public readonly resource: CfnScheduleGroup;
  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.resource = new CfnScheduleGroup(this, "Resource");
  }

  public get ref() {
    return this.resource.ref;
  }
}
