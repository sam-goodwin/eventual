import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import {
  Runtime,
  Architecture,
  Function,
  Code,
  IFunction,
} from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import {
  DeduplicationScope,
  FifoThroughputLimit,
  IQueue,
  Queue,
} from "aws-cdk-lib/aws-sqs";
import {
  AttributeType,
  BillingMode,
  ITable,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { aws_cloudwatch, Names, RemovalPolicy } from "aws-cdk-lib";
import { ENV_NAMES } from "@eventual/aws-runtime";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import path from "path";
import { execSync } from "child_process";
import { IGrantable, IPrincipal } from "aws-cdk-lib/aws-iam";
import { Statistic, Unit } from "aws-cdk-lib/aws-cloudwatch";

export interface WorkflowProps {
  entry: string;
  name?: string;
  environment?: {
    [key: string]: string;
  };
  orchestrator?: {
    reservedConcurrentExecutions?: number;
  };
}

export class Workflow extends Construct implements IGrantable {
  public readonly workflowName: string;
  /**
   * S3 bucket that contains events necessary to replay a workflow execution.
   *
   * The orchestrator reads from history at the start and updates it at the end.
   */
  public readonly history: IBucket;
  /**
   * Workflow (fifo) queue which contains events that wake up a workflow execution.
   *
   * {@link WorkflowTask} delivery new {@link HistoryEvent}s to the workflow.
   */
  public readonly workflowQueue: IQueue;
  /**
   * A single-table used for execution data and granular workflow events/
   */
  public readonly table: ITable;
  /**
   * A lambda function which can start a workflow.
   *
   * TODO: Replace with REST API.
   */
  public readonly startWorkflowFunction: IFunction;
  /**
   * A dynamo table used to lock/claim activities to enforce exactly once execution.
   */
  public readonly locksTable: ITable;
  /**
   * The lambda function which runs the user's Activities.
   */
  public readonly activityWorker: IFunction;
  /**
   * The lambda function which runs the user's Workflow.
   */
  public readonly orchestrator: IFunction;
  /**
   * The {@link IPrincipal} to grant permissions to.
   *
   * This is the {@link activityWorker}'s {@link IPrincipal} since that is the only function
   * running user-defined code that can interact with an external service.
   */
  public readonly grantPrincipal: IPrincipal;

  constructor(scope: Construct, id: string, props: WorkflowProps) {
    super(scope, id);

    this.workflowName = props.name ?? Names.uniqueResourceName(this, {});

    // ExecutionHistoryBucket
    this.history = new Bucket(this, "History", {
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // WorkflowQueue
    this.workflowQueue = new Queue(this, "WorkflowQueue", {
      fifo: true,
      fifoThroughputLimit: FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
      deduplicationScope: DeduplicationScope.MESSAGE_GROUP,
    });

    // Table - History, Executions, ExecutionData
    this.table = new Table(this, "table", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.startWorkflowFunction = new NodejsFunction(
      this,
      "startWorkflowFunction",
      {
        entry: path.join(
          require.resolve("@eventual/aws-runtime"),
          "../../esm/functions/start-workflow.js"
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
          [ENV_NAMES.TABLE_NAME]: this.table.tableName,
          [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.workflowQueue.queueUrl,
        },
      }
    );

    this.locksTable = new Table(this, "Locks", {
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

    this.activityWorker = new Function(this, "Worker", {
      architecture: Architecture.ARM_64,
      code: Code.fromAsset(path.join(outDir, "activity-worker")),
      // the bundler outputs activity-worker/index.js
      handler: "index.default",
      runtime: Runtime.NODEJS_16_X,
      memorySize: 512,
      reservedConcurrentExecutions:
        props.orchestrator?.reservedConcurrentExecutions,
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        [ENV_NAMES.TABLE_NAME]: this.table.tableName,
        [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.workflowQueue.queueUrl,
        [ENV_NAMES.ACTIVITY_LOCK_TABLE_NAME]: this.locksTable.tableName,
        [ENV_NAMES.EVENTUAL_WORKER]: "1",
        [ENV_NAMES.WORKFLOW_NAME]: this.workflowName,
        ...(props.environment ?? {}),
      },
      // retry attempts should be handled with a new request and a new retry count in accordance with the user's retry policy.
      retryAttempts: 0,
    });
    // grant methods on a workflow affect the activity
    this.grantPrincipal = this.activityWorker.grantPrincipal;

    this.orchestrator = new Function(this, "Orchestrator", {
      architecture: Architecture.ARM_64,
      code: Code.fromAsset(path.join(outDir, "orchestrator")),
      // the bundler outputs orchestrator/index.js
      handler: "index.default",
      runtime: Runtime.NODEJS_16_X,
      memorySize: 512,
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        [ENV_NAMES.ACTIVITY_WORKER_FUNCTION_NAME]:
          this.activityWorker.functionName,
        [ENV_NAMES.EXECUTION_HISTORY_BUCKET]: this.history.bucketName,
        [ENV_NAMES.TABLE_NAME]: this.table.tableName,
        [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.workflowQueue.queueUrl,
        [ENV_NAMES.WORKFLOW_NAME]: this.workflowName,
      },
      events: [
        new SqsEventSource(this.workflowQueue, {
          batchSize: 10,
          reportBatchItemFailures: true,
        }),
      ],
    });

    // the orchestrator will accumulate history state in S3
    this.history.grantReadWrite(this.orchestrator);

    // the worker emits events back to the orchestrator's event loop
    this.workflowQueue.grantSendMessages(this.activityWorker);

    // the orchestrator can emit workflow tasks when invoking other workflows or inline activities
    this.workflowQueue.grantSendMessages(this.orchestrator);

    // the orchestrator asynchronously invokes activities
    this.activityWorker.grantInvoke(this.orchestrator);

    // the worker will issue an UpdateItem command to lock
    this.locksTable.grantWriteData(this.activityWorker);

    // Enable creating history to start a workflow.
    this.table.grantReadWriteData(this.startWorkflowFunction);

    // Enable creating history related to a workflow.
    this.table.grantReadWriteData(this.activityWorker);

    // Enable creating history and updating executions
    this.table.grantReadWriteData(this.orchestrator);

    // Enable sending workflow task
    this.workflowQueue.grantSendMessages(this.startWorkflowFunction);

    // TODO - timers and retry
  }

  /**
   * The time taken for the {@link orchestrator} function to process a batch of events.
   */
  public metricOrchestrateDuration(
    options?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: "OrchestrateDuration",
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  /**
   * The time taken to run the workflow's function to advance execution of the workflow.
   *
   * This does not include the time taken to invoke commands or save history. It is
   * purely a metric for how well the workflow's function is performing as history grows.
   */
  public metricAdvanceExecutionDuration(
    options?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: "AdvanceExecutionDuration",
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  /**
   * The time taken to invoke all Commands emitted by advancing a workflow.
   */
  public metricInvokeCommandsDuration(
    options?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: "InvokeCommandsDuration",
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  /**
   * The time taken to invoke a single Command - i.e. the time taken to
   * run the Async Invoke Lambda Function API.
   */
  public metricInvokeCommandDuration(
    options?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: "InvokeCommandDuration",
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  /**
   * Time taken to download an execution's history from S3.
   */
  public metricLoadHistoryDuration(
    options?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: "LoadHistoryDuration",
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  /**
   * Time taken to save an execution's history to S3.
   */
  public metricSaveHistoryDuration(
    options?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: "SaveHistoryDuration",
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  /**
   * Time taken to replay history events through the workflow function.
   *
   * I.e. the time taken for the workflow to reach the current point in the execution.
   */
  public metricReplayHistoryDuration(
    options?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return this.metric({
      statistic: Statistic.AVERAGE,
      metricName: "ReplayHistoryDuration",
      unit: Unit.MILLISECONDS,
      ...options,
    });
  }

  /**
   * The size of the history S3 file in bytes.
   */
  public metricHistorySizeBytes(
    options?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return this.metric({
      metricName: "HistorySizeBytes",
      unit: Unit.BYTES,
      statistic: Statistic.AVERAGE,
      ...options,
    });
  }

  /**
   * The number of events stored in the history S3 file.
   */
  public metricHistoryNumEvents(
    options?: aws_cloudwatch.MetricOptions
  ): aws_cloudwatch.Metric {
    return this.metric({
      metricName: "HistoryNumEvents",
      unit: Unit.COUNT,
      statistic: Statistic.SUM,
      ...options,
    });
  }

  private metric(
    options: aws_cloudwatch.MetricOptions & {
      metricName: string;
    }
  ) {
    return new aws_cloudwatch.Metric({
      ...options,
      namespace: "Eventual",
      dimensionsMap: {
        ...options?.dimensionsMap,
        WorkflowName: this.workflowName,
      },
    });
  }
}
