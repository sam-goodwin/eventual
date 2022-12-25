import { ENV_NAMES } from "@eventual/aws-runtime";
import { ArnFormat, CfnResource, Resource, Stack } from "aws-cdk-lib";
import {
  IGrantable,
  IRole,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { IQueue, Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import path from "path";
import { IActivities } from "./activities";
import { addEnvironment, baseNodeFnProps } from "./utils";
import { IWorkflows } from "./workflows";

export interface IScheduler {
  /**
   * @internal
   */
  configureScheduleTimer(func: Function): void;
  grantCreateSchedule(grantable: IGrantable): void;
  grantDeleteSchedule(grantable: IGrantable): void;
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
}

/**
 * Subsystem that orchestrates long running timers. Used to orchestrate timeouts, sleep
 * and heartbeats.
 */
export class Scheduler extends Construct implements IScheduler, IGrantable {
  /**
   * The Scheduler's IAM Role.
   */
  public readonly schedulerRole: IRole;
  /**
   * Timer (standard) queue which helps orchestrate scheduled things like sleep and dynamic retries.
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
    this.forwarder = new NodejsFunction(this, "Forwarder", {
      entry: path.join(
        require.resolve("@eventual/aws-runtime"),
        "../../esm/handlers/schedule-forwarder.js"
      ),
      handler: "handle",
      ...baseNodeFnProps,
    });

    // Allow the scheduler to create workflow tasks.
    this.forwarder.grantInvoke(this.schedulerRole);

    this.handler = new NodejsFunction(this, "handler", {
      entry: path.join(
        require.resolve("@eventual/aws-runtime"),
        "../../esm/handlers/timer-handler.js"
      ),
      handler: "handle",
      ...baseNodeFnProps,
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

  /**
   * @internal
   */
  public configureScheduleTimer(func: Function) {
    this.grantCreateSchedule(func);
    addEnvironment(func, {
      ...(func === this.forwarder
        ? {}
        : {
            [ENV_NAMES.SCHEDULE_FORWARDER_ARN]: this.forwarder.functionArn,
          }),
      [ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN]: this.dlq.queueArn,
      [ENV_NAMES.SCHEDULER_GROUP]: this.schedulerGroup.ref,
      [ENV_NAMES.SCHEDULER_ROLE_ARN]: this.schedulerRole.roleArn,
      [ENV_NAMES.TIMER_QUEUE_URL]: this.queue.queueUrl,
    });
    this.schedulerRole.grantPassRole(func.grantPrincipal);
  }

  public grantCreateSchedule(grantable: IGrantable) {
    this.queue.grantSendMessages(grantable);
    grantable.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ["scheduler:CreateSchedule"],
        resources: [this.scheduleGroupWildCardArn],
      })
    );
  }

  public grantDeleteSchedule(grantable: IGrantable) {
    this.queue.grantSendMessages(grantable);
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
    this.props.workflows.configureSendWorkflowEvent(this.handler);
    this.props.activities.configureRead(this.handler);
    this.configureScheduleTimer(this.handler);
  }

  private configureScheduleForwarder() {
    this.configureScheduleTimer(this.forwarder);
    this.grantDeleteSchedule(this.forwarder);
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
