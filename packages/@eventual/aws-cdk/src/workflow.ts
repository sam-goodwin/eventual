import {
  aws_lambda,
  aws_lambda_event_sources,
  aws_lambda_nodejs,
  aws_s3,
  aws_sqs,
} from "aws-cdk-lib";
import { SourceMapMode } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export interface WorkflowProps {
  file: string;
  /**
   * An optional path to where the bundle of the workflow is.
   *
   * @default - the bundle is automatically generated (with the drawback of being synchronous IO)
   */
  bundlePath?: string;
}

export class Workflow extends Construct {
  /**
   * A SQS FIFO queue where the MessageGroupID is used to ensure messages
   * to a workflow instance are handled in strict FIFO order.
   */
  readonly queue: aws_sqs.IQueue;
  /**
   * A S3 Bucket where the state is stored.
   */
  readonly state: aws_s3.IBucket;
  /**
   * The Lambda Function that orchestrates Workflows.
   *
   * It is attached to the {@link queue} and stores state in {@link state}.
   */
  readonly orchestrator: aws_lambda.IFunction;

  constructor(scope: Construct, id: string, props: WorkflowProps) {
    super(scope, id);

    this.queue = new aws_sqs.Queue(this, "Mailbox", {
      fifo: true,
      fifoThroughputLimit: aws_sqs.FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
    });

    this.state = new aws_s3.Bucket(this, "State", {});

    this.orchestrator = new aws_lambda_nodejs.NodejsFunction(
      this,
      "Orchestrator",
      {
        entry: props.file,
        handler: "index.default",
        bundling: {
          sourceMap: true,
          sourceMapMode: SourceMapMode.INLINE,
          sourcesContent: false,
        },
      }
    );

    this.orchestrator.addEventSource(
      new aws_lambda_event_sources.SqsEventSource(this.queue, {
        reportBatchItemFailures: true,
      })
    );
  }
}
