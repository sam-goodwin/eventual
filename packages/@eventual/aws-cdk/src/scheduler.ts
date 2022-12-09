import { ENV_NAMES } from "@eventual/aws-runtime";
import { ArnFormat, Stack } from "aws-cdk-lib";
import {
  IGrantable,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Function, IFunction } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { CfnScheduleGroup } from "aws-cdk-lib/aws-scheduler";
import { IQueue, Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import path from "path";
import { ActivityController } from "./activity-controller";
import { addEnvironment, baseNodeFnProps } from "./utils";
import { WorkflowController } from "./workflow-controller";

export interface SchedulerProps {
  /**
   * Workflow controller represent the ability to control the workflow, including starting the workflow
   * sending signals, and more.
   */
  workflowController: WorkflowController;
  /**
   * Used by the activity heartbeat monitor to retrieve heartbeat data.
   */
  activityController: ActivityController;
}

export class Scheduler extends Construct {
  /**
   * The Scheduler's IAM Role.
   */
  readonly schedulerRole: Role;
  /**
   * Timer (standard) queue which helps orchestrate scheduled things like sleep and dynamic retries.
   *
   * Worths in tandem with the {@link CfnSchedulerGroup} to create millisecond latency, long running timers.
   */
  public readonly timerQueue: IQueue;
  /**
   * A group in which all of the workflow schedules are created under.
   */
  public readonly schedulerGroup: CfnScheduleGroup;
  /**
   * The lambda function which executes timed requests on the timerQueue.
   */
  public readonly timerHandler: IFunction;
  /**
   * Forwards long running timers from the EventBridge schedules to the timer queue.
   *
   * The Timer Queue supports <15m timers at a sub second accuracy, the EventBridge schedule
   * support arbitrary length events at a sub minute accuracy.
   */
  public readonly scheduleForwarder: IFunction;
  /**
   * A common Dead Letter Queue to handle failures from various places.
   *
   * Timers - When the EventBridge scheduler fails to invoke the Schedule Forwarder Lambda.
   */
  public readonly dlq: Queue;

  constructor(scope: Construct, id: string, props: SchedulerProps) {
    super(scope, id);
    this.schedulerGroup = new CfnScheduleGroup(this, "ScheduleGroup");

    const schedulerRole = (this.schedulerRole = new Role(
      this,
      "SchedulerRole",
      {
        assumedBy: new ServicePrincipal("scheduler.amazonaws.com", {
          conditions: {
            ArnEquals: {
              "aws:SourceArn": this.scheduleGroupWildCardArn,
            },
          },
        }),
      }
    ));

    this.dlq = new Queue(this, "dlq");

    this.dlq.grantSendMessages(schedulerRole);

    this.timerQueue = new Queue(this, "timerQueue");

    // TODO: handle failures to a DLQ - https://github.com/functionless/eventual/issues/40
    const scheduleForwarder = (this.scheduleForwarder = new NodejsFunction(
      this,
      "scheduleForwarder",
      {
        entry: path.join(
          require.resolve("@eventual/aws-runtime"),
          "../../esm/handlers/schedule-forwarder.js"
        ),
        handler: "handle",
        ...baseNodeFnProps,
        environment: {
          [ENV_NAMES.SCHEDULER_GROUP]: this.schedulerGroup.ref,
          [ENV_NAMES.SCHEDULER_ROLE_ARN]: schedulerRole.roleArn,
          [ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN]: this.dlq.queueArn,
          [ENV_NAMES.TIMER_QUEUE_URL]: this.timerQueue.queueUrl,
        },
      }
    ));

    const timerHandler = (this.timerHandler = new NodejsFunction(
      this,
      "timerHandlerFunction",
      {
        entry: path.join(
          require.resolve("@eventual/aws-runtime"),
          "../../esm/handlers/timer-handler.js"
        ),
        handler: "handle",
        ...baseNodeFnProps,
        events: [
          new SqsEventSource(this.timerQueue, {
            reportBatchItemFailures: true,
          }),
        ],
      }
    ));

    props.workflowController.configureWorkflowControl(timerHandler);
    props.activityController.configureActivityControl(timerHandler);

    this.configureScheduleTimer(timerHandler);
    this.configureScheduleTimer(scheduleForwarder);
    this.grantDeleteSchedule(this.scheduleForwarder);

    // Allow the scheduler to create workflow tasks.
    this.scheduleForwarder.grantInvoke(schedulerRole);
  }

  /**
   * @internal
   */
  public configureScheduleTimer(func: Function) {
    this.grantCreateSchedule(func);
    addEnvironment(func, {
      ...(func === this.scheduleForwarder
        ? {}
        : {
            [ENV_NAMES.SCHEDULE_FORWARDER_ARN]:
              this.scheduleForwarder.functionArn,
          }),
      [ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN]: this.dlq.queueArn,
      [ENV_NAMES.SCHEDULER_GROUP]: this.schedulerGroup.ref,
      [ENV_NAMES.SCHEDULER_ROLE_ARN]: this.schedulerRole.roleArn,
      [ENV_NAMES.TIMER_QUEUE_URL]: this.timerQueue.queueUrl,
    });
    this.schedulerRole.grantPassRole(func.grantPrincipal);
  }

  public grantCreateSchedule(grantable: IGrantable) {
    this.timerQueue.grantSendMessages(grantable);
    grantable.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ["scheduler:CreateSchedule"],
        resources: [this.scheduleGroupWildCardArn],
      })
    );
  }

  public grantDeleteSchedule(grantable: IGrantable) {
    this.timerQueue.grantSendMessages(grantable);
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
}
