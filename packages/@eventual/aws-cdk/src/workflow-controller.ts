import { ENV_NAMES } from "@eventual/aws-runtime";
import { RemovalPolicy } from "aws-cdk-lib";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import {
  DeduplicationScope,
  FifoThroughputLimit,
  IQueue,
  Queue,
} from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { addEnvironment } from "./utils";

export interface WorkflowControllerProps {
  table: ITable;
}

export class WorkflowController extends Construct {
  public workflowQueue: IQueue;
  public history: IBucket;

  constructor(
    scope: Construct,
    id: string,
    private props: WorkflowControllerProps
  ) {
    super(scope, id);

    this.workflowQueue = new Queue(this, "WorkflowQueue", {
      fifo: true,
      fifoThroughputLimit: FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
      deduplicationScope: DeduplicationScope.MESSAGE_GROUP,
      contentBasedDeduplication: true,
    });

    this.history = new Bucket(this, "History", {
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  configureReadWorkflow(func: Function) {
    this.grantReadWorkflowData(func);
    addEnvironment(func, {
      [ENV_NAMES.TABLE_NAME]: this.props.table.tableName,
    });
  }

  configureWorkflowControl(func: Function) {
    this.grantWorkflowControl(func);
    addEnvironment(func, {
      [ENV_NAMES.TABLE_NAME]: this.props.table.tableName,
      [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.workflowQueue.queueUrl,
    });
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

  grantWorkflowControl(grantable: IGrantable) {
    this.grantReadWorkflowData(grantable);
    this.grantWriteExecutionHistory(grantable);
    this.workflowQueue.grantSendMessages(grantable);
  }

  grantWriteExecutionHistory(grantable: IGrantable) {
    this.props.table.grantWriteData(grantable);
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
}
