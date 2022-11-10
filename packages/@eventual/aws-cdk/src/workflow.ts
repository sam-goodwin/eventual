import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime, Architecture } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import {
  DeduplicationScope,
  FifoThroughputLimit,
  Queue,
} from "aws-cdk-lib/aws-sqs";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { RemovalPolicy } from "aws-cdk-lib";
import { ENV_NAMES } from "@eventual/aws-runtime";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import path from "path";
import { Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";

export interface WorkflowProps {
  entry: string;
  /**
   * default: handler
   */
  handler?: string;
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
      deduplicationScope: DeduplicationScope.MESSAGE_GROUP,
    });

    // Table - History, Execution, ExecutionData
    const table = new Table(this, "table", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // workflow lambda
    // TODO: minify for production
    const workflowFunction = new NodejsFunction(this, "workflowFunction", {
      entry: props.entry,
      handler: props.handler,
      runtime: Runtime.NODEJS_16_X,
      architecture: Architecture.ARM_64,
      bundling: {
        // todo, make this configurable by the user to not force esm?
        mainFields: ["module", "main"],
        esbuildArgs: {
          "--conditions": "module",
        },
      },
      environment: {
        [ENV_NAMES.TABLE_NAME]: table.tableName,
        [ENV_NAMES.WORKFLOW_QUEUE_URL]: workflowQueue.queueUrl,
        [ENV_NAMES.EXECUTION_HISTORY_BUCKET]: executionHistoryBucket.bucketName,
      },
    });

    table.grantReadWriteData(workflowFunction);
    workflowQueue.grantSendMessages(workflowFunction);
    executionHistoryBucket.grantReadWrite(workflowFunction);

    const statement = new PolicyStatement({
      actions: ["lambda:InvokeFunction"],
      resources: [
        workflowFunction.functionArn,
        `${workflowFunction.functionArn}:*`,
      ],
    });
    const policy = new Policy(this, "myLambda_policy", {
      statements: [statement],
    });
    policy.attachToRole(workflowFunction.role!);

    workflowFunction.addEventSource(new SqsEventSource(workflowQueue));

    const startWorkflowFunction = new NodejsFunction(
      this,
      "startWorkflowFunction",
      {
        // cannot require.resolve a esm path
        entry: path.resolve(
          __dirname,
          "../node_modules/@eventual/aws-runtime/lib/esm/functions/start-workflow.js"
        ),
        handler: "handle",
        runtime: Runtime.NODEJS_16_X,
        architecture: Architecture.ARM_64,
        bundling: {
          // https://github.com/aws/aws-cdk/issues/21329#issuecomment-1212336356
          // cannot output as .mjs file as ulid does not support it.
          mainFields: ["module", "main"],
          esbuildArgs: {
            "--conditions": "module",
          },
          metafile: true,
        },
        environment: {
          [ENV_NAMES.TABLE_NAME]: table.tableName,
          [ENV_NAMES.WORKFLOW_QUEUE_URL]: workflowQueue.queueUrl,
        },
      }
    );

    table.grantReadWriteData(startWorkflowFunction);
    workflowQueue.grantSendMessages(startWorkflowFunction);

    // TODO - timers and retry
  }
}
