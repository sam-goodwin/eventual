import { ENV_NAMES } from "@eventual/aws-runtime";
import { ArnFormat, Stack } from "aws-cdk-lib";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Function, IFunction } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { CfnScheduleGroup } from "aws-cdk-lib/aws-scheduler";
import { IQueue, Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import path from "path";
import { baseNodeFnProps } from "./utils";

export interface SchedulerProps {
  /**
   * A single-table used for execution data and granular workflow events/
   */
  table: ITable;
  /**
   * Workflow (fifo) queue which contains events that wake up a workflow execution.
   *
   * {@link WorkflowTask} delivery new {@link HistoryEvent}s to the workflow.
   */
  workflowQueue: IQueue;
  /**
   * The lambda function which runs the user's Workflow.
   */
  orchestrator: Function;
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

  public get scheduleGroupWildCardArn() {
    return Stack.of(this).formatArn({
      service: "scheduler",
      resource: "schedule",
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      resourceName: `${this.schedulerGroup.ref}/*`,
    });
  }

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
    this.scheduleForwarder = new NodejsFunction(this, "scheduleForwarder", {
      entry: path.join(
        require.resolve("@eventual/aws-runtime"),
        "../../esm/handlers/schedule-forwarder.js"
      ),
      handler: "handle",
      ...baseNodeFnProps,
      environment: {
        [ENV_NAMES.SCHEDULER_GROUP]: this.schedulerGroup.ref,
        [ENV_NAMES.TIMER_QUEUE_URL]: this.timerQueue.queueUrl,
        [ENV_NAMES.SCHEDULER_ROLE_ARN]: schedulerRole.roleArn,
        [ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN]: this.dlq.queueArn,
        [ENV_NAMES.SCHEDULER_GROUP]: this.schedulerGroup.ref,
        [ENV_NAMES.TIMER_QUEUE_URL]: this.timerQueue.queueUrl,
      },
    });

    this.timerHandler = new NodejsFunction(this, "timerHandlerFunction", {
      entry: path.join(
        require.resolve("@eventual/aws-runtime"),
        "../../esm/handlers/timer-handler.js"
      ),
      handler: "handle",
      ...baseNodeFnProps,
      environment: {
        [ENV_NAMES.TABLE_NAME]: props.table.tableName,
        [ENV_NAMES.WORKFLOW_QUEUE_URL]: props.workflowQueue.queueUrl,
      },
      events: [
        new SqsEventSource(this.timerQueue, {
          reportBatchItemFailures: true,
        }),
      ],
    });

    this.timerQueue.grantSendMessages(this.scheduleForwarder);

    // grants the orchestrator the permission to create new schedules for sleep.
    this.scheduleForwarder.addToRolePolicy(
      new PolicyStatement({
        actions: ["scheduler:DeleteSchedule"],
        resources: [this.scheduleGroupWildCardArn],
      })
    );

    props.table.grantReadWriteData(this.timerHandler);

    props.workflowQueue.grantSendMessages(this.timerHandler);

    // Allow the scheduler to create workflow tasks.
    this.scheduleForwarder.grantInvoke(schedulerRole);

    // grants the orchestrator the ability to pass the scheduler role to the creates schedules
    schedulerRole.grantPassRole(props.orchestrator.grantPrincipal);
  }
}
