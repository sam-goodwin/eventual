import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import {
  Architecture,
  Function,
  Code,
  IFunction,
  Runtime,
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
import { ArnFormat, CfnOutput, Names, RemovalPolicy, Stack } from "aws-cdk-lib";
import { ENV_NAMES } from "@eventual/aws-runtime";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import path from "path";
import { execSync } from "child_process";
import {
  IGrantable,
  IPrincipal,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { CfnScheduleGroup } from "aws-cdk-lib/aws-scheduler";

export interface WorkflowProps {
  entry: string;
  name?: string;
  environment?: {
    [key: string]: string;
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
   * Timer (standard) queue which helps orchestrate scheduled things like sleep and dynamic retries.
   *
   * Worths in tandem with the {@link CfnSchedulerGroup} to create millisecond latency, long running timers.
   */
  public readonly timerQueue: IQueue;
  /**
   * A group in which all of the workflow schedules are created under.
   */
  public readonly schedulerGroup: CfnScheduleGroup;
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
   * The lambda function which executes timed requests on the timerQueue.
   */
  public readonly timerHandler: IFunction;
  /**
   * Forwards long running timers from the EventBridge schedules to the timer queue.
   *
   * The Timer Queue supports <15m timers at a sub second accuracy, the EventBridge schedule
   * support arbitrary length events at a sub minute accuracy.
   */
  public readonly scheduleForwarder: IFunction;

  readonly grantPrincipal: IPrincipal;

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
      contentBasedDeduplication: true,
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

    this.schedulerGroup = new CfnScheduleGroup(this, "schedulerGroup");

    const schedulerRole = new Role(this, "schedulerRole", {
      assumedBy: new ServicePrincipal("scheduler.amazonaws.com", {
        conditions: {
          "aws:SourceArn": Stack.of(this).formatArn({
            service: "scheduler",
            resource: "schedule",
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
            resourceName: `${this.schedulerGroup.ref}/*`,
          }),
        },
      }),
    });

    const dlq = new Queue(this, "dlq");

    dlq.grantSendMessages(schedulerRole);

    this.timerQueue = new Queue(this, "timerQueue");

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
        [ENV_NAMES.WORKFLOW_QUEUE_ARN]: this.workflowQueue.queueArn,
        [ENV_NAMES.SCHEDULER_ROLE_ARN]: schedulerRole.roleArn,
        [ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN]: dlq.queueArn,
        [ENV_NAMES.SCHEDULER_GROUP]: this.schedulerGroup.ref,
      },
      events: [
        new SqsEventSource(this.workflowQueue, {
          batchSize: 10,
          reportBatchItemFailures: true,
        }),
      ],
    });

    this.timerHandler = new NodejsFunction(this, "timerHandlerFunction", {
      entry: path.join(
        require.resolve("@eventual/aws-runtime"),
        "../../esm/handlers/timer-handler.js"
      ),
      handler: "handle",
      runtime: Runtime.NODEJS_16_X,
      architecture: Architecture.ARM_64,
      bundling: {
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
    });

    this.scheduleForwarder = new NodejsFunction(this, "scheduleForwarder", {
      entry: path.join(
        require.resolve("@eventual/aws-runtime"),
        "../../esm/handlers/schedule-forwarder.js"
      ),
      handler: "handle",
      runtime: Runtime.NODEJS_16_X,
      architecture: Architecture.ARM_64,
      bundling: {
        mainFields: ["module", "main"],
        esbuildArgs: {
          "--conditions": "module,import,require",
        },
        metafile: true,
      },
      environment: {
        [ENV_NAMES.SCHEDULER_GROUP]: this.schedulerGroup.ref,
        [ENV_NAMES.TIMER_QUEUE_URL]: this.timerQueue.queueUrl,
      },
    });

    this.timerQueue.grantSendMessages(this.scheduleForwarder);

    // grants the orchestrator the permission to create new schedules for sleep.
    this.scheduleForwarder.addToRolePolicy(
      new PolicyStatement({
        actions: ["scheduler:DeleteSchedule"],
        resources: ["*"],
      })
    );

    this.table.grantReadWriteData(this.timerHandler);

    this.workflowQueue.grantSendMessages(this.timerHandler);

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

    // Allow the scheduler to create workflow tasks.
    this.scheduleForwarder.grantInvoke(schedulerRole);

    // grants the orchestrator the permission to create new schedules for sleep.
    this.orchestrator.addToRolePolicy(
      new PolicyStatement({
        actions: ["scheduler:CreateSchedule"],
        resources: ["*"],
      })
    );

    // grants the orchestrator the ability to pass the scheduler role to the creates schedules
    schedulerRole.grantPassRole(this.orchestrator.grantPrincipal);

    // TODO - timers and retry
    new CfnOutput(this, "workflow-data", {
      exportName: `eventual-workflow-data:${this.workflowName}`,
      value: JSON.stringify({
        functions: {
          orchestrator: this.orchestrator.functionName,
          activityWorker: this.activityWorker.functionName,
        },
      }),
    });
  }
}
