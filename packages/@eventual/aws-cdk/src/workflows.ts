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
import { IScheduler } from "./scheduler";
import { ServiceFunction } from "./service-function";
import { addEnvironment } from "./utils";

export interface WorkflowsProps {
  scheduler: IScheduler;
  activities: IActivities;
  table: ITable;
}

export interface IWorkflows {
  configureStartWorkflow(func: Function): void;
  grantStartWorkflowEvent(grantable: IGrantable): void;
  configureSendWorkflowEvent(func: Function): void;
  grantSendWorkflowEvent(grantable: IGrantable): void;
  configureRecordHistory(func: Function): void;
  configureReadHistory(func: Function): void;
  grantWriteExecutionHistory(grantable: IGrantable): void;
  configureReadWorkflowData(func: Function): void;
  grantReadWorkflowData(grantable: IGrantable): void;
  grantRecordHistory(grantable: IGrantable): void;
  grantReadHistory(grantable: IGrantable): void;
}

export class Workflows extends Construct implements IWorkflows, IGrantable {
  readonly orchestrator: Function;
  readonly queue: IQueue;
  readonly history: IBucket;

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

  get grantPrincipal() {
    return this.orchestrator.grantPrincipal;
  }

  configureStartWorkflow(func: Function) {
    this.configureSendWorkflowEvent(func);
    this.grantStartWorkflowEvent(func);
    addEnvironment(func, {
      [ENV_NAMES.TABLE_NAME]: this.props.table.tableName,
    });
  }

  grantStartWorkflowEvent(grantable: IGrantable) {
    this.grantSendWorkflowEvent(grantable);
    this.props.table.grantWriteData(grantable);
  }

  configureSendWorkflowEvent(func: Function) {
    this.grantSendWorkflowEvent(func);
    addEnvironment(func, {
      [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.queue.queueUrl,
    });
  }

  grantSendWorkflowEvent(grantable: IGrantable) {
    this.queue.grantSendMessages(grantable);
  }

  configureRecordHistory(func: Function) {
    this.grantRecordHistory(func);
    addEnvironment(func, {
      [ENV_NAMES.EXECUTION_HISTORY_BUCKET]: this.history.bucketName,
    });
  }

  configureReadHistory(func: Function) {
    this.grantReadHistory(func);
    addEnvironment(func, {
      [ENV_NAMES.EXECUTION_HISTORY_BUCKET]: this.history.bucketName,
    });
  }

  grantWriteExecutionHistory(grantable: IGrantable) {
    this.props.table.grantWriteData(grantable);
  }

  configureReadWorkflowData(func: Function) {
    this.grantReadWorkflowData(func);
    addEnvironment(func, {
      [ENV_NAMES.TABLE_NAME]: this.props.table.tableName,
    });
  }

  grantReadWorkflowData(grantable: IGrantable) {
    this.props.table.grantReadData(grantable);
  }

  grantRecordHistory(grantable: IGrantable) {
    this.history.grantReadWrite(grantable);
  }

  grantReadHistory(grantable: IGrantable) {
    this.history.grantRead(grantable);
  }

  configureSendSignal(func: Function) {
    this.configureSendWorkflowEvent(func);
  }

  grantSendSignal(grantable: IGrantable) {
    this.grantSendWorkflowEvent(grantable);
  }

  configureFullControl(func: Function) {
    this.configureStartWorkflow(func);
    this.grantWriteExecutionHistory(func);
  }

  private configureOrchestrator() {
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
  }
}
