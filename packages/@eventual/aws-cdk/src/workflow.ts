import path from "path";

import { execSync } from "child_process";
import { Construct } from "constructs";
import { aws_dynamodb, aws_lambda, aws_sqs } from "aws-cdk-lib";
import { Architecture, Code, Runtime } from "aws-cdk-lib/aws-lambda";
import { DeduplicationScope, FifoThroughputLimit } from "aws-cdk-lib/aws-sqs";

export interface WorkflowProps {
  entry: string;
}

export class Workflow extends Construct {
  /**
   * A FIFO SQS Queue to store a {@link Workflow}'s event loop.
   */
  readonly eventLoop: aws_sqs.IQueue;

  /**
   * A Table for locking ActivityIDs.
   */
  readonly locks: aws_dynamodb.ITable;

  /**
   * The Orchestrator Function that maintains history and triggers Activities.
   */
  readonly orchestrator: aws_lambda.IFunction;

  /**
   * The Worker Function that processes Activity requests.
   */
  readonly worker: aws_lambda.Function;

  constructor(scope: Construct, id: string, props: WorkflowProps) {
    super(scope, id);

    this.eventLoop = new aws_sqs.Queue(this, "EventLoop", {
      fifo: true,
      fifoThroughputLimit: FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
      deduplicationScope: DeduplicationScope.MESSAGE_GROUP,
    });

    this.locks = new aws_dynamodb.Table(this, "Locks", {
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: aws_dynamodb.AttributeType.STRING,
      },
    });

    const outDir = path.join(".eventual", this.node.addr);

    execSync(
      `node ${require.resolve(
        "@eventual/compiler/lib/eventual-bundle.js"
      )} ${outDir} ${props.entry}`
    );

    this.orchestrator = new aws_lambda.Function(this, "Orchestrator", {
      architecture: Architecture.ARM_64,
      code: Code.fromAsset(outDir),
      handler: "orchestrator.default",
      runtime: Runtime.NODEJS_16_X,
      memorySize: 512,
    });

    this.worker = new aws_lambda.Function(this, "Worker", {
      architecture: Architecture.ARM_64,
      code: Code.fromAsset(outDir),
      handler: "worker.default",
      runtime: Runtime.NODEJS_16_X,
      memorySize: 512,
    });
  }
}
