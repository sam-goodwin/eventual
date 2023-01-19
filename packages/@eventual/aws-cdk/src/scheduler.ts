import { ENV_NAMES } from "@eventual/aws-runtime";
import { ArnFormat, CfnResource, Resource, Stack } from "aws-cdk-lib";
import {
  IGrantable,
  IRole,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Code, Function } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { IQueue, Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { IActivities } from "./activities";
import { Logging } from "./logging";
import { baseFnProps, outDir } from "./utils";
import { IWorkflows } from "./workflows";

export interface IScheduler {
  /**
   * {@link TimerClient.startTimer} or {@link TimerClient.scheduleEvent}.
   */
  configureScheduleTimer(func: Function): void;
  /**
   * {@link TimerClient.startTimer} or {@link TimerClient.scheduleEvent}.
   */
  grantCreateTimer(grantable: IGrantable): void;
}

export interface SchedulerProps {
  /**
   * Workflow controller represent the ability to control the workflow, including starting the workflow
   * sending signals, and more.
   */
  workflows: IWorkflows;
  /**
   * Used by the activity heartbeat monitor to retrieve heartbeat data.
   */
  activities: IActivities;
  logging: Logging;
}

/**
 * Subsystem that orchestrates long running timers. Used to orchestrate timeouts, timers
 * and heartbeats.
 */
export class Scheduler
  extends Construct
  implements IScheduler, IGrantable, IScheduler
{
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

  constructor(scope: Construct, id: string, private props: SchedulerProps) {
    super(scope, id);
    this.schedulerGroup = new ScheduleGroup(this, "ScheduleGroup");

    this.schedulerRole = new Role(this, "SchedulerRole", {
      assumedBy: new ServicePrincipal("scheduler.amazonaws.com", {
        conditions: {
          ArnEquals: {
            "aws:SourceArn": this.scheduleGroupWildCardArn,
          },
        },
      }),
    });

    this.dlq = new Queue(this, "DeadLetterQueue");
    this.dlq.grantSendMessages(this.schedulerRole);

    this.queue = new Queue(this, "Queue");

    // TODO: handle failures to a DLQ - https://github.com/functionless/eventual/issues/40
    this.forwarder = new Function(this, "Forwarder", {
      code: Code.fromAsset(outDir(this, "SchedulerForwarder")),
      ...baseFnProps,
      handler: "index.handle",
    });

    // Allow the scheduler to create workflow tasks.
    this.forwarder.grantInvoke(this.schedulerRole);

    this.handler = new Function(this, "handler", {
      code: Code.fromAsset(outDir(this, "SchedulerHandler")),
      ...baseFnProps,
      handler: "index.handle",
      events: [
        new SqsEventSource(this.queue, {
          reportBatchItemFailures: true,
        }),
      ],
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
  private grantCleanupTimer(grantable: IGrantable) {
    grantable.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ["scheduler:DeleteSchedule"],
        resources: [this.scheduleGroupWildCardArn],
      })
    );
  }

  private get scheduleGroupWildCardArn() {
    return Stack.of(this).formatArn({
      service: "scheduler",
      resource: "schedule",
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      resourceName: `${this.schedulerGroup.ref}/*`,
    });
  }

  private configureHandler() {
    // to support the ScheduleEventRequest
    this.props.workflows.configureSubmitExecutionEvents(this.handler);
    // to lookup activity heartbeat time
    this.props.activities.configureReadActivities(this.handler);
    // to re-schedule a new timer on heartbeat check success
    this.configureScheduleTimer(this.handler);
    // logs to the execution
    this.props.logging.configurePutServiceLogs(this.handler);
  }

  private configureScheduleForwarder() {
    // starts a short timer to forward the timer
    this.configureSubmitToTimerQueue(this.forwarder);
    // deletes the EB schedule
    this.configureCleanupTimer(this.forwarder);
    // logs to the execution when forwarding
    this.props.logging.configurePutServiceLogs(this.handler);
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.SCHEDULE_FORWARDER_ARN]: () => this.forwarder.functionArn,
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
  public readonly resource: CfnResource;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.resource = new CfnResource(this, "Resource", {
      type: "AWS::Scheduler::ScheduleGroup",
      properties: {},
    });
  }

  public get ref() {
    return this.resource.ref;
  }
}
