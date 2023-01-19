import { ENV_NAMES } from "@eventual/aws-runtime";
import { ServiceType } from "@eventual/core";
import { ComponentResource, ResourceOptions } from "@pulumi/pulumi";
import { Activities } from "./activities";
import { IGrantable } from "./aws/grantable";
import { Queue } from "./aws/queue";
import { Table } from "./aws/table";
import { Events } from "./events";
import { Logging } from "./logging";
import { Scheduler } from "./scheduler";
import { ServiceFunction } from "./service-function";
import { Function } from "./aws/function";
import { Bucket } from "./aws/bucket";
import { lambda } from "@pulumi/aws";
import { addEnvironment } from "./utils";

export interface WorkflowsProps {
  serviceName: string;
  scheduler: Scheduler;
  activities: Activities;
  table: Table;
  events: Events;
  logging: Logging;
  orchestrator?: {
    reservedConcurrentExecutions?: number;
  };
}

/**
 * Subsystem which manages and orchestrates workflows and workflow executions.
 */
export class Workflows extends ComponentResource implements IGrantable {
  public readonly orchestrator: Function;
  public readonly queue: Queue;
  public readonly history: Bucket;

  constructor(
    id: string,
    private props: WorkflowsProps,
    opts?: ResourceOptions
  ) {
    super("eventual:Workflows", id, undefined, opts);

    this.history = new Bucket(
      "History",
      {},
      {
        parent: this,
      }
    );

    this.queue = new Queue(
      "Queue",
      {
        fifoQueue: true,
        fifoThroughputLimit: "perMessageGroupId",
        deduplicationScope: "messageGroup",
        contentBasedDeduplication: true,
      },
      {
        parent: this,
      }
    );

    this.orchestrator = new ServiceFunction(
      "Orchestrator",
      {
        name: `${props.serviceName}-orchestrator-handler`,
        serviceType: ServiceType.OrchestratorWorker,
      },
      {
        parent: this,
      }
    );

    new lambda.EventSourceMapping("", {
      functionName: this.orchestrator.functionName,
      eventSourceArn: this.queue.queueArn,
      batchSize: 10,
      functionResponseTypes: ["ReportBatchItemFailures"],
    });

    this.configureOrchestrator();
  }

  public get grantPrincipal() {
    return this.orchestrator.grantPrincipal;
  }

  public configureStartExecution(func: Function) {
    this.configureSendWorkflowEvent(func);
    // when we start a workflow, we create the log stream it will use.
    this.props.logging.configurePutServiceLogs(func);
    this.grantSubmitWorkflowEvent(func);
    addEnvironment(func, {
      [ENV_NAMES.TABLE_NAME]: this.props.table.tableName,
    });
  }

  public grantSubmitWorkflowEvent(grantable: IGrantable) {
    this.grantSendWorkflowEvent(grantable);
    this.props.table.grantWriteData(grantable);
  }

  public configureSendWorkflowEvent(func: Function) {
    this.grantSendWorkflowEvent(func);
    addEnvironment(func, {
      [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.queue.queueUrl,
    });
  }

  public grantSendWorkflowEvent(grantable: IGrantable) {
    this.queue.grantSendMessages(grantable);
  }

  public configureRecordHistory(func: Function) {
    this.grantRecordHistory(func);
    addEnvironment(func, {
      [ENV_NAMES.EXECUTION_HISTORY_BUCKET]: this.history.bucketName,
      // TODO: we shouldn't need this but all workflow clients need it
      [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.queue.queueUrl,
      [ENV_NAMES.TABLE_NAME]: this.props.table.tableName,
    });
  }

  public grantWriteExecutionHistory(grantable: IGrantable) {
    this.props.table.grantWriteData(grantable);
  }

  public configureReadWorkflowData(func: Function) {
    this.grantReadWorkflowData(func);
    addEnvironment(func, {
      [ENV_NAMES.TABLE_NAME]: this.props.table.tableName,
      // TODO: we shouldn't need this but all workflow clients need it
      [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.queue.queueUrl,
    });
  }

  public grantReadWorkflowData(grantable: IGrantable) {
    this.props.table.grantReadData(grantable);
  }

  public grantRecordHistory(grantable: IGrantable) {
    this.history.grantReadWriteData(grantable);
  }

  public configureReadHistory(func: Function) {
    this.grantReadHistory(func);
    addEnvironment(func, {
      [ENV_NAMES.EXECUTION_HISTORY_BUCKET]: this.history.bucketName,
      // TODO: we shouldn't need this but all workflow clients need it
      [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.queue.queueUrl,
      [ENV_NAMES.TABLE_NAME]: this.props.table.tableName,
    });
  }

  public grantReadHistory(grantable: IGrantable) {
    this.history.grantRead(grantable);
  }

  public configureSendSignal(func: Function) {
    this.configureSendWorkflowEvent(func);
  }

  public grantSendSignal(grantable: IGrantable) {
    this.grantSendWorkflowEvent(grantable);
  }

  public grantFilterOrchestratorLogs(grantable: IGrantable) {
    this.orchestrator.logGroup.grant(grantable, "logs:FilterLogEvents");
  }

  /**
   * Allows starting workflows, finishing activities, reading workflow status
   * and sending signals to workflows.
   */
  public configureFullControl(func: Function) {
    this.configureStartExecution(func);
    this.configureSendWorkflowEvent(func);
    this.configureReadWorkflowData(func);
    this.configureSendSignal(func);
    this.configureReadHistory(func);
  }

  private configureOrchestrator() {
    this.props.events.configurePublish(this.orchestrator);
    // allows the orchestrator to save and load events from the history s3 bucket
    this.configureRecordHistory(this.orchestrator);
    // allows the orchestrator to directly invoke the activity worker lambda function (async)
    this.props.activities.configureScheduleActivity(this.orchestrator);
    // allows allows the orchestrator to start timeout and timers
    this.props.scheduler.configureScheduleTimer(this.orchestrator);
    // allows the orchestrator to send events to the workflow queue,
    // write events to the execution table, and start other workflows
    this.configureFullControl(this.orchestrator);
    // allows the workflow to cancel activities
    this.props.activities.configureUpdateActivity(this.orchestrator);
    // adds the logging extension (via a layer) to the orchestrator
    this.props.logging.configurePutServiceLogs(this.orchestrator);
  }
}
