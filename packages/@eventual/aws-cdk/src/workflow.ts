import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime, Architecture } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { FifoThroughputLimit, Queue } from "aws-cdk-lib/aws-sqs";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { RemovalPolicy } from "aws-cdk-lib";
import { ENV_NAMES } from "@eventual/aws-runtime";

export const TABLE_NAME = "TABLE_NAME";
export const EXECUTION_HISTORY_BUCKET = "EXECUTION_HISTORY_BUCKET";
export const WORKFLOW_QUEUE_URL = "WORKFLOW_QUEUE_URL";

export interface WorkflowProps {
  entry: string;
}

// placeholder
export class Workflow extends Construct {
  constructor(scope: Construct, id: string, props: WorkflowProps) {
    super(scope, id);

    // ExecutionHistoryBucket
    const executionHistoryBucket = new Bucket(this, "executionHistoryBucket");

    // WorkflowQueue
    const workflowQueue = new Queue(this, "workflowQueue", {
      fifo: true,
      fifoThroughputLimit: FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
    });

    // Table - History, Execution, ExecutionData
    const table = new Table(this, "table", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // workflow lambda
    new NodejsFunction(this, "workflowFunction", {
      entry: props.entry,
      runtime: Runtime.NODEJS_16_X,
      architecture: Architecture.ARM_64,
      bundling: {
        mainFields: ["module", "main"],
      },
      environment: {
        [TABLE_NAME]: table.tableName,
        [WORKFLOW_QUEUE_URL]: workflowQueue.queueUrl,
        [EXECUTION_HISTORY_BUCKET]: executionHistoryBucket.bucketArn,
      },
    });

    // TODO - timers and retry
  }
}
