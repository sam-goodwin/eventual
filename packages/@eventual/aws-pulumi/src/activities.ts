import { ServiceType } from "@eventual/core";
import {
  ComponentResource,
  ComponentResourceOptions,
  ResourceOptions,
} from "@pulumi/pulumi";
import { Logging } from "./logging";
import { ServiceFunction } from "./service-function";
import { Function } from "./aws/function";
import { addEnvironment } from "./utils";
import { ENV_NAMES } from "@eventual/aws-runtime";
import { IGrantable } from "./aws/grantable";
import { Table } from "./aws/table";
import { Events } from "./events";
import { Scheduler } from "./scheduler";
import { Workflows } from "./workflows";

export interface ActivitiesProps extends ComponentResourceOptions {
  serviceName: string;
  workflows: Workflows;
  scheduler: Scheduler;
  environment?: Record<string, string>;
  events: Events;
  logging: Logging;
}

/**
 * Subsystem which supports durable activities.
 *
 * Activities are started by the {@link Workflow.orchestrator} and send back {@link WorkflowEvent}s on completion.
 */
export class Activities extends ComponentResource {
  /**
   * Table which contains activity information for claiming, heartbeat, and cancellation.
   */
  public readonly table: Table;
  /**
   * Function which executes all activities. The worker is invoked by the {@link Workflows.orchestrator}.
   */
  public readonly worker: ServiceFunction;

  constructor(
    id: string,
    private props: ActivitiesProps,
    opts?: ResourceOptions
  ) {
    super("eventual:Activities", id, {}, opts);

    this.table = new Table(
      "Table",
      {
        billingMode: "PAY_PER_REQUEST",
        hashKey: "pk",
        attributes: [
          {
            name: "pk",
            type: "S",
          },
        ],
      },
      {
        parent: this,
      }
    );

    this.worker = new ServiceFunction(
      "Worker",
      {
        name: `${props.serviceName}-activity-handler`,
        serviceType: ServiceType.ActivityWorker,
        memorySize: 512,
        // retry attempts should be handled with a new request and a new retry count in accordance with the user's retry policy.
        retryAttempts: 0,
        // TODO: determine worker timeout strategy
        timeout: 60,
      },
      {
        parent: this,
      }
    );

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
      [ENV_NAMES.ACTIVITY_TABLE_NAME]: this.table.name,
    });
  }

  public grantUpdateActivity(grantable: IGrantable) {
    this.table.grantReadWriteData(grantable);
  }

  public configureRead(func: Function) {
    this.grantRead(func);
    addEnvironment(func, {
      [ENV_NAMES.ACTIVITY_TABLE_NAME]: this.table.name,
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
    this.props.logging.configurePutServiceLogs(this.worker);
  }
}
