import { ENV_NAMES } from "@eventual/aws-runtime";
import { ServiceType } from "@eventual/core";
import { RemovalPolicy } from "aws-cdk-lib";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import {
  DeduplicationScope,
  FifoThroughputLimit,
  IQueue,
  Queue,
} from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { IActivities } from "./activities";
import { Events } from "./events";
import { Logging } from "./logging";
import { IScheduler } from "./scheduler";
import { ServiceFunction } from "./service-function";
import { addEnvironment } from "./utils";

export interface WorkflowsProps {
  scheduler: IScheduler;
  activities: IActivities;
  table: ITable;
  events: Events;
  logging: Logging;
  orchestrator?: {
    reservedConcurrentExecutions?: number;
  };
}

export interface IWorkflows {
  configureStartExecution(func: Function): void;
  grantSubmitWorkflowEvent(grantable: IGrantable): void;

  configureSendWorkflowEvent(func: Function): void;
  grantSendWorkflowEvent(grantable: IGrantable): void;

  grantWriteExecutionHistory(grantable: IGrantable): void;

  configureReadWorkflowData(func: Function): void;
  grantReadWorkflowData(grantable: IGrantable): void;

  configureRecordHistory(func: Function): void;
  grantRecordHistory(grantable: IGrantable): void;

  configureReadHistory(func: Function): void;
  grantReadHistory(grantable: IGrantable): void;

  configureSendSignal(func: Function): void;
  grantSendSignal(grantable: IGrantable): void;

  grantFilterOrchestratorLogs(grantable: IGrantable): void;

  configureFullControl(func: Function): void;
}

/**
 * Subsystem which manages and orchestrates workflows and workflow executions.
 */
export class Workflows extends Construct implements IWorkflows, IGrantable {
  public readonly orchestrator: Function;
  public readonly queue: IQueue;
  public readonly history: IBucket;

  constructor(scope: Construct, id: string, private props: WorkflowsProps) {
    super(scope, id);

    this.history = new Bucket(scope, "History", {
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.queue = new Queue(scope, "Queue", {
      fifo: true,
      fifoThroughputLimit: FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
      deduplicationScope: DeduplicationScope.MESSAGE_GROUP,
      contentBasedDeduplication: true,
    });

    this.orchestrator = new ServiceFunction(this, "Orchestrator", {
      serviceType: ServiceType.OrchestratorWorker,
      events: [
        new SqsEventSource(this.queue, {
          batchSize: 10,
          reportBatchItemFailures: true,
        }),
      ],
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
    this.history.grantReadWrite(grantable);
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
    // allows allows the orchestrator to start timeout and sleep timers
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
