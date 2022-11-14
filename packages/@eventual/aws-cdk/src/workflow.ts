import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime, Architecture, Function, Code } from "aws-cdk-lib/aws-lambda";
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
import { execSync } from "child_process";

export interface WorkflowProps {
  entry: string;
}

export class Workflow extends Construct {
  constructor(scope: Construct, id: string, props: WorkflowProps) {
    super(scope, id);

    // ExecutionHistoryBucket
    const history = new Bucket(this, "History", {
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // WorkflowQueue
    const workflowQueue = new Queue(this, "WorkflowQueue", {
      fifo: true,
      fifoThroughputLimit: FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
      deduplicationScope: DeduplicationScope.MESSAGE_GROUP,
    });

    // Table - History, Executions, ExecutionData
    const table = new Table(this, "table", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const startWorkflowFunction = new NodejsFunction(
      this,
      "startWorkflowFunction",
      {
        entry: require.resolve(
          "@eventual/aws-runtime/lib/esm/functions/start-workflow.js"
        ),
        handler: "handle",
        runtime: Runtime.NODEJS_16_X,
        architecture: Architecture.ARM_64,
        bundling: {
          // https://github.com/aws/aws-cdk/issues/21329#issuecomment-1212336356
          // cannot output as .mjs file as ulid does not support it.
          mainFields: ["module", "main"],
          esbuildArgs: {
            "--conditions": "module,import,require",
          },
          metafile: true,
        },
        environment: {
          [ENV_NAMES.TABLE_NAME]: table.tableName,
          [ENV_NAMES.WORKFLOW_QUEUE_URL]: workflowQueue.queueUrl,
        },
      }
    );

    const locks = new Table(this, "Locks", {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const outDir = path.join(".eventual", this.node.addr);

    execSync(
      `node ${require.resolve(
        "@eventual/compiler/lib/eventual-bundle.js"
      )} ${outDir} ${props.entry}`
    );

    const actionWorker = new Function(this, "Worker", {
      architecture: Architecture.ARM_64,
      code: Code.fromAsset(path.join(outDir, "action-worker")),
      // the bundler outputs action-worker/index.js
      handler: "index.default",
      runtime: Runtime.NODEJS_16_X,
      memorySize: 512,
      environment: {
        [ENV_NAMES.TABLE_NAME]: table.tableName,
        [ENV_NAMES.WORKFLOW_QUEUE_URL]: workflowQueue.queueUrl,
        [ENV_NAMES.ACTIVITY_LOCK_TABLE_NAME]: locks.tableName,
      },
      // retry attempts should be handled with a new request and a new retry count in accordance with the user's retry policy.
      retryAttempts: 0,
    });

    const orchestrator = new Function(this, "Orchestrator", {
      architecture: Architecture.ARM_64,
      code: Code.fromAsset(path.join(outDir, "orchestrator")),
      // the bundler outputs action-worker/index.js
      handler: "index.default",
      runtime: Runtime.NODEJS_16_X,
      memorySize: 512,
      environment: {
        [ENV_NAMES.ACTION_WORKER_FUNCTION_NAME]: actionWorker.functionName,
        [ENV_NAMES.EXECUTION_HISTORY_BUCKET]: history.bucketName,
        [ENV_NAMES.TABLE_NAME]: table.tableName,
        [ENV_NAMES.WORKFLOW_QUEUE_URL]: workflowQueue.queueUrl,
      },
      events: [
        new SqsEventSource(workflowQueue, {
          batchSize: 10,
          reportBatchItemFailures: true,
        }),
      ],
    });

    // the orchestrator will accumulate history state in S3
    history.grantReadWrite(orchestrator);

    // the worker emits events back to the orchestrator's event loop
    workflowQueue.grantSendMessages(actionWorker);

    // the orchestrator can emit workflow tasks when invoking other workflows or inline activities
    workflowQueue.grantSendMessages(orchestrator);

    // the orchestrator asynchronously invokes activities
    actionWorker.grantInvoke(orchestrator);

    // the worker will issue an UpdateItem command to lock
    locks.grantWriteData(actionWorker);

    // Enable creating history to start a workflow.
    table.grantReadWriteData(startWorkflowFunction);

    // Enable creating history related to a workflow.
    table.grantReadWriteData(actionWorker);

    // Enable creating history and updating executions
    table.grantReadWriteData(orchestrator);

    // Enable sending workflow task
    workflowQueue.grantSendMessages(startWorkflowFunction);

    // TODO - timers and retry
  }
}
