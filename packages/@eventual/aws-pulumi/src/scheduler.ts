import { IGrantable } from "./aws/grantable";
import { Function } from "./aws/function";
import { Activities } from "./activities";
import { Logging } from "./logging";
import { ComponentResource, ResourceOptions } from "@pulumi/pulumi";
import { Role } from "./aws/role";
import { Queue } from "./aws/queue";
import { lambda, scheduler } from "@pulumi/aws";
import { addEnvironment, baseFnProps, outDir } from "./utils";
import { ENV_NAMES } from "@eventual/aws-runtime";
import { Workflows } from "./workflows";
import { FileAsset } from "@pulumi/pulumi/asset";

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
  workflows: Workflows;
  /**
   * Used by the activity heartbeat monitor to retrieve heartbeat data.
   */
  activities: Activities;
  logging: Logging;
}

/**
 * Subsystem that orchestrates long running timers. Used to orchestrate timeouts, timers
 * and heartbeats.
 */
export class Scheduler
  extends ComponentResource
  implements IScheduler, IGrantable
{
  /**
   * The Scheduler's IAM Role.
   */
  public readonly schedulerRole: Role;
  /**
   * Timer (standard) queue which helps orchestrate scheduled things like timers, heartbeat, and dynamic retries.
   *
   * Worths in tandem with the {@link CfnSchedulerGroup} to create millisecond latency, long running timers.
   */
  public readonly queue: Queue;
  /**
   * A group in which all of the workflow schedules are created under.
   */
  public readonly schedulerGroup: scheduler.ScheduleGroup;
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

  constructor(
    id: string,
    private props: SchedulerProps,
    options: ResourceOptions
  ) {
    super("eventual:Scheduler", id, {}, options);

    this.schedulerGroup = new scheduler.ScheduleGroup(
      "ScheduleGroup",
      {},
      {
        parent: this,
      }
    );

    this.schedulerRole = new Role(
      "SchedulerRole",
      {
        assumeRolePolicy: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Service: "scheduler.amazonaws.com",
              },
              Condition: {
                ArnEquals: {
                  "aws:SourceArn": this.scheduleGroupWildCardArn,
                },
              },
            },
          ],
        },
      },
      {
        parent: this,
      }
    );

    this.dlq = new Queue(
      "DeadLetterQueue",
      {},
      {
        parent: this,
      }
    );
    this.dlq.grantSendMessages(this.schedulerRole);

    this.queue = new Queue(
      "Queue",
      {},
      {
        parent: this,
      }
    );

    // TODO: handle failures to a DLQ - https://github.com/functionless/eventual/issues/40
    this.forwarder = new Function(
      "Forwarder",
      {
        code: outDir(this, "SchedulerForwarder").apply(
          (path) => new FileAsset(path)
        ),
        ...baseFnProps,
        handler: "index.handle",
      },
      {
        parent: this,
      }
    );

    // Allow the scheduler to create workflow tasks.
    this.forwarder.grantInvoke(this.schedulerRole);

    this.handler = new Function(
      "handler",
      {
        code: outDir(this, "SchedulerHandler").apply(
          (path) => new FileAsset(path)
        ),
        ...baseFnProps,
        handler: "index.handle",
      },
      {
        parent: this,
      }
    );

    new lambda.EventSourceMapping("", {
      functionName: this.handler.functionName,
      eventSourceArn: this.queue.queueArn,
      functionResponseTypes: ["ReportBatchItemFailures"],
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
      [ENV_NAMES.SCHEDULER_GROUP]: this.schedulerGroup.arn,
      [ENV_NAMES.SCHEDULER_ROLE_ARN]: this.schedulerRole.roleArn,
      [ENV_NAMES.TIMER_QUEUE_URL]: this.queue.queueUrl,
    });
    this.schedulerRole.grantPassRole(func.grantPrincipal);
  }

  public grantCreateSchedule(grantable: IGrantable) {
    this.queue.grantSendMessages(grantable);
    grantable.grantPrincipal.addToPrincipalPolicy({
      Effect: "Allow",
      Action: ["scheduler:CreateSchedule"],
      Resource: this.scheduleGroupWildCardArn,
    });
  }

  public grantDeleteSchedule(grantable: IGrantable) {
    this.queue.grantSendMessages(grantable);
    grantable.grantPrincipal.addToPrincipalPolicy({
      Effect: "Allow",
      Action: ["scheduler:DeleteSchedule"],
      Resource: this.scheduleGroupWildCardArn,
    });
  }

  private get scheduleGroupWildCardArn() {
    return `${this.schedulerGroup.arn}/*`;
  }

  private configureHandler() {
    this.props.workflows.configureSendWorkflowEvent(this.handler);
    this.props.activities.configureRead(this.handler);
    this.configureScheduleTimer(this.handler);
    this.props.logging.configurePutServiceLogs(this.handler);
  }

  private configureScheduleForwarder() {
    this.configureScheduleTimer(this.forwarder);
    this.grantDeleteSchedule(this.forwarder);
    this.props.logging.configurePutServiceLogs(this.forwarder);
  }
}
