import { ENV_NAMES } from "@eventual/aws-runtime";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  ITable,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { addEnvironment } from "./utils";
import { IWorkflows } from "./workflows";
import { Function } from "aws-cdk-lib/aws-lambda";
import { IScheduler } from "./scheduler";
import { ServiceType } from "@eventual/core";
import { ServiceFunction } from "./service-function";
import { Events } from "./events";

export interface ActivitiesProps {
  workflows: IWorkflows;
  scheduler: IScheduler;
  environment?: Record<string, string>;
  events: Events;
}

export interface IActivities {
  configureCompleteActivity(func: Function): void;
  grantCompleteActivity(grantable: IGrantable): void;

  configureUpdateActivity(func: Function): void;
  grantUpdateActivity(grantable: IGrantable): void;

  configureRead(func: Function): void;
  grantRead(grantable: IGrantable): void;

  configureScheduleActivity(func: Function): void;
  grantScheduleActivity(grantable: IGrantable): void;

  grantFilterWorkerLogs(grantable: IGrantable): void;

  configureFullControl(func: Function): void;
}

/**
 * Subsystem which supports durable activities.
 *
 * Activities are started by the {@link Workflow.orchestrator} and send back {@link WorkflowEvent}s on completion.
 */
export class Activities extends Construct implements IActivities, IGrantable {
  /**
   * Table which contains activity information for claiming, heartbeat, and cancellation.
   */
  public table: ITable;
  /**
   * Function which executes all activities. The worker is invoked by the {@link Workflows.orchestrator}.
   */
  public worker: Function;

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

    this.worker = new ServiceFunction(this, "Worker", {
      serviceType: ServiceType.ActivityWorker,
      memorySize: 512,
      // retry attempts should be handled with a new request and a new retry count in accordance with the user's retry policy.
      retryAttempts: 0,
      // TODO: determine worker timeout strategy
      timeout: Duration.minutes(1),
    });

    this.configureActivityWorker();
  }

  public get grantPrincipal() {
    return this.worker.grantPrincipal;
  }

  public configureCompleteActivity(func: Function) {
    this.props.workflows.configureSendWorkflowEvent(func);
  }

  public grantCompleteActivity(grantable: IGrantable) {
    this.props.workflows.grantSendWorkflowEvent(grantable);
  }

  public configureUpdateActivity(func: Function) {
    this.grantUpdateActivity(func);
    addEnvironment(func, {
      [ENV_NAMES.ACTIVITY_TABLE_NAME]: this.table.tableName,
    });
  }

  public grantUpdateActivity(grantable: IGrantable) {
    this.table.grantReadWriteData(grantable);
  }

  public configureRead(func: Function) {
    this.grantRead(func);
    addEnvironment(func, {
      [ENV_NAMES.ACTIVITY_TABLE_NAME]: this.table.tableName,
    });
  }

  public grantRead(grantable: IGrantable) {
    this.table.grantReadData(grantable);
  }

  /**
   * Configure the ability heartbeat, cancel, and finish activities.
   */
  public configureFullControl(func: Function) {
    this.configureRead(func);
    this.configureUpdateActivity(func);
  }

  public configureScheduleActivity(func: Function) {
    this.grantScheduleActivity(func);
    addEnvironment(func, {
      [ENV_NAMES.ACTIVITY_WORKER_FUNCTION_NAME]: this.worker.functionName,
    });
  }

  public grantScheduleActivity(grantable: IGrantable) {
    this.worker.grantInvoke(grantable);
  }

  public grantFilterWorkerLogs(grantable: IGrantable) {
    this.worker.logGroup.grant(grantable, "logs:FilterLogEvents");
  }

  private configureActivityWorker() {
    this.props.events.configurePublish(this.worker);
    if (this.props.environment) {
      addEnvironment(this.worker, this.props.environment);
    }
    // allows the activity worker to send events to the workflow queue
    // and lookup the status of the workflow.
    this.props.workflows.configureStartExecution(this.worker);
    this.props.workflows.configureReadWorkflowData(this.worker);
    // allows the activity worker to claim activities and check their heartbeat status.
    this.configureUpdateActivity(this.worker);
    // allows the activity worker to start the heartbeat monitor
    this.props.scheduler.configureScheduleTimer(this.worker);
  }
}
