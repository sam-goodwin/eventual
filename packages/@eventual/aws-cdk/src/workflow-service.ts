import { ENV_NAMES, ExecutionRecord } from "@eventual/aws-runtime";
import { LogLevel } from "@eventual/core";
import { ExecutionQueueEventEnvelope } from "@eventual/core-runtime";
import {
  AttributeType,
  BillingMode,
  ITable,
  ProjectionType,
  StreamViewType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import {
  DeduplicationScope,
  FifoThroughputLimit,
  IQueue,
  Queue,
} from "aws-cdk-lib/aws-sqs";
import { RemovalPolicy } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { BucketService } from "./bucket-service";
import {
  EventBridgePipe,
  PipeSourceParameters,
} from "./constructs/event-bridge-pipe";
import { EntityService } from "./entity-service";
import { EventService } from "./event-service";
import { grant } from "./grant";
import { LazyInterface } from "./proxy-construct";
import { SchedulerService } from "./scheduler-service";
import { ServiceFunction } from "./service-function";
import type { TaskService } from "./task-service.js";
import type { SearchService } from "./search/search-service";
import { ServiceConstructProps } from "./service-common";
import { QueueService } from "./queue-service";
import { SocketService } from "./socket-service";

export interface WorkflowsProps extends ServiceConstructProps {
  bucketService: LazyInterface<BucketService<any>>;
  entityService: LazyInterface<EntityService<any>>;
  searchService: LazyInterface<SearchService<any>> | undefined;
  eventService: EventService;
  overrides?: WorkflowServiceOverrides;
  schedulerService: LazyInterface<SchedulerService>;
  socketService: LazyInterface<SocketService>;
  taskService: LazyInterface<TaskService>;
  queueService: LazyInterface<QueueService<any>>;
}

export interface WorkflowServiceOverrides {
  /**
   * Set the reservedConcurrentExecutions for the workflow orchestrator lambda function.
   *
   * This function consumes from the central SQS FIFO Queue and the number of parallel executions
   * scales directly on the number of active workflow executions. Each execution id is used as
   * the message group ID which directly affects concurrent executions.
   *
   * Set this value to protect the workflow's concurrent executions from:
   * 1. browning out other functions by consuming concurrent executions
   * 2. be brought down by other functions in the AWS account
   * 3. ensure the timely performance of workflows for a given scale
   */
  reservedConcurrentExecutions?: number;
  /**
   * Optionally provide a log group.
   *
   * @default one will be created @ [service_name]-execution-logs
   */
  logGroup?: LogGroup;
  /**
   * Log level to put into the workflow logs.
   *
   * @default INFO
   */
  logLevel?: LogLevel;
}

interface PipeToWorkflowQueueProps {
  grant: (grantable: IGrantable) => void;
  /**
   * path to the execution id $.path.to.id ex: $.dynamodb.NewImage.id.S
   */
  executionIdPath: string;
  /**
   * Input template format event object or path <$.path.to.event> ex: <$.dynamodb.NewImage.insertEvent.S>
   */
  event: string;
  /**
   * Source ARN
   */
  source: string;
  /**
   * Source Properties given to the pipe
   */
  sourceProps: PipeSourceParameters;
}

/**
 * Subsystem which manages and orchestrates workflows and workflow executions.
 */
export class WorkflowService {
  public readonly orchestrator: Function;
  public readonly queue: IQueue;
  public readonly history: IBucket;
  public readonly logGroup: LogGroup;
  public readonly executionsTable: ITable;
  public readonly executionHistoryTable: ITable;

  constructor(private props: WorkflowsProps) {
    // creates the System => Workflow scope.
    const workflowServiceScope = new Construct(
      props.systemScope,
      "WorkflowService"
    );

    this.logGroup =
      props.overrides?.logGroup ??
      new LogGroup(props.serviceScope, "WorkflowExecutionLogs", {
        removalPolicy: RemovalPolicy.DESTROY,
        logGroupName: `${props.serviceName}-execution-logs`,
      });

    this.history = new Bucket(workflowServiceScope, "HistoryBucket", {
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Table - History, Executions
    const executionsTable = (this.executionsTable = new Table(
      workflowServiceScope,
      "ExecutionTable",
      {
        partitionKey: { name: "pk", type: AttributeType.STRING },
        sortKey: { name: "sk", type: AttributeType.STRING },
        billingMode: BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.DESTROY,
        stream: StreamViewType.NEW_IMAGE,
      }
    ));

    executionsTable.addLocalSecondaryIndex({
      indexName: ExecutionRecord.START_TIME_SORTED_INDEX,
      sortKey: {
        name: ExecutionRecord.START_TIME,
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    this.executionHistoryTable = new Table(
      workflowServiceScope,
      "ExecutionHistoryTable",
      {
        partitionKey: { name: "pk", type: AttributeType.STRING },
        sortKey: { name: "sk", type: AttributeType.STRING },
        billingMode: BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );

    this.queue = new Queue(workflowServiceScope, "Queue", {
      fifo: true,
      fifoThroughputLimit: FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
      deduplicationScope: DeduplicationScope.MESSAGE_GROUP,
      contentBasedDeduplication: true,
    });

    this.orchestrator = new ServiceFunction(
      workflowServiceScope,
      "Orchestrator",
      {
        functionNameSuffix: `orchestrator-handler`,
        build: props.build,
        bundledFunction: props.build.system.workflowService.orchestrator,
        defaults: {
          environment: props.environment,
          events: [
            new SqsEventSource(this.queue, {
              batchSize: 10,
              reportBatchItemFailures: true,
            }),
          ],
        },
        overrides: {
          reservedConcurrentExecutions:
            props.overrides?.reservedConcurrentExecutions,
        },
        serviceName: props.serviceName,
      }
    );

    /**
     * transform the dynamo record into an {@link ExecutionQueueEventEnvelope} that contains a {@link WorkflowStarted} event.
     *
     * {
     *    task: {
     *        executionId: <$.dynamodb.id.S>,
     *        events: [<$.dynamodb.insertEvent.S>]
     *    }
     * }
     */
    this.pipeToWorkflowQueue(workflowServiceScope, "StartEvent", {
      event: `<$.dynamodb.NewImage.${ExecutionRecord.INSERT_EVENT}.S>`,
      executionIdPath: "$.dynamodb.NewImage.id.S",
      grant: (role) => this.executionsTable.grantStreamRead(role),
      source: this.executionsTable.tableStreamArn!,
      sourceProps: {
        // will retry forever in the case of an SQS outage!
        DynamoDBStreamParameters: {
          // when CREATE/REPLACING a pipe, it can take up to 1 minute to start polling for events.
          // TRIM_HORIZON will catch any events created during that one minute (and last 24 hours for existing streams)
          // The assumption is that it is unlikely that the pipe will be replaced on an active service
          // TODO: check in with the Event Bridge team to see LATEST will work without dropping events
          //       for new streams.
          StartingPosition: "TRIM_HORIZON",
          MaximumBatchingWindowInSeconds: 1,
        },
        FilterCriteria: {
          Filters: [
            {
              Pattern: JSON.stringify({
                eventName: ["INSERT"],
                dynamodb: {
                  NewImage: {
                    pk: {
                      S: [ExecutionRecord.PARTITION_KEY],
                    },
                    [ExecutionRecord.INSERT_EVENT]: { S: [{ exists: true }] },
                  },
                },
              }),
            },
          ],
        },
      },
    });

    this.configureOrchestrator();
  }

  public pipeToWorkflowQueue(
    scope: Construct,
    id: string,
    props: PipeToWorkflowQueueProps
  ) {
    const pipe = new EventBridgePipe(scope, id, {
      source: props.source,
      sourceParameters: props.sourceProps,
      target: this.queue.queueArn,
      targetParameters: {
        SqsQueueParameters: {
          MessageGroupId: props.executionIdPath,
        },
        InputTemplate: `{"task": { "events": [${props.event}], "executionId": <${props.executionIdPath}> } }`,
      },
    });

    this.queue.grantSendMessages(pipe);
    props.grant(pipe);
  }

  /**
   * Workflow Client
   */

  public configureStartExecution(func: Function) {
    this.configureReadExecutions(func);
    this.configureWriteExecutions(func);
    // when we start a workflow, we create the log stream it will use.
    this.configurePutWorkflowExecutionLogs(func);
    this.configureSubmitExecutionEvents(func);
  }

  @grant()
  public grantStartExecution(grantable: IGrantable) {
    this.grantReadExecutions(grantable);
    this.grantWriteExecutions(grantable);
    // when we start a workflow, we create the log stream it will use.
    this.grantPutWorkflowExecutionLogs(grantable);
    this.grantSubmitExecutionEvents(grantable);
  }

  public configureCompleteExecution(func: Function) {
    // update the execution record
    this.configureWriteExecutions(func);
    // send completion to parent workflow if applicable
    this.configureSubmitExecutionEvents(func);
  }

  @grant()
  public grantCompleteExecution(grantable: IGrantable) {
    this.grantWriteExecutions(grantable);
    this.grantSubmitExecutionEvents(grantable);
  }

  /**
   * Execution Queue Client Configuration
   */

  public configureSubmitExecutionEvents(func: Function) {
    this.grantSubmitExecutionEvents(func);
    this.addEnvs(func, ENV_NAMES.WORKFLOW_QUEUE_URL);
  }

  @grant()
  public grantSubmitExecutionEvents(grantable: IGrantable) {
    this.queue.grantSendMessages(grantable);
  }

  public configureSendSignal(func: Function) {
    this.configureSubmitExecutionEvents(func);
  }

  @grant()
  public grantSendSignal(grantable: IGrantable) {
    this.grantSubmitExecutionEvents(grantable);
  }

  /**
   * Execution Store Configurations
   */

  public configureReadExecutions(func: Function) {
    this.grantReadExecutions(func);
    this.addEnvs(func, ENV_NAMES.EXECUTION_TABLE_NAME);
  }

  @grant()
  public grantReadExecutions(grantable: IGrantable) {
    this.executionsTable.grantReadData(grantable);
  }

  public configureWriteExecutions(func: Function) {
    this.grantWriteExecutions(func);
    this.addEnvs(func, ENV_NAMES.EXECUTION_TABLE_NAME);
  }

  @grant()
  public grantWriteExecutions(grantable: IGrantable) {
    this.executionsTable.grantWriteData(grantable);
  }

  /**
   * Execution History Store Configurations
   */

  public configureReadExecutionHistory(func: Function) {
    this.grantReadExecutionHistory(func);
    this.addEnvs(func, ENV_NAMES.EXECUTION_HISTORY_TABLE_NAME);
  }

  @grant()
  public grantReadExecutionHistory(grantable: IGrantable) {
    this.executionHistoryTable.grantReadData(grantable);
  }

  public configureWriteExecutionHistory(func: Function) {
    this.grantWriteExecutionHistory(func);
    this.addEnvs(func, ENV_NAMES.EXECUTION_HISTORY_TABLE_NAME);
  }

  @grant()
  public grantWriteExecutionHistory(grantable: IGrantable) {
    this.executionHistoryTable.grantWriteData(grantable);
  }

  /**
   * Execution History State Store Configurations
   */

  public configureReadHistoryState(func: Function) {
    this.grantReadHistoryState(func);
    this.addEnvs(func, ENV_NAMES.EXECUTION_HISTORY_BUCKET);
  }

  @grant()
  public grantReadHistoryState(grantable: IGrantable) {
    this.history.grantRead(grantable);
  }

  public configureWriteHistoryState(func: Function) {
    this.grantWriteHistoryState(func);
    this.addEnvs(func, ENV_NAMES.EXECUTION_HISTORY_BUCKET);
  }

  @grant()
  public grantWriteHistoryState(grantable: IGrantable) {
    this.history.grantWrite(grantable);
  }

  /**
   * Log Client - for workflow execution logs
   */

  public configureGetExecutionLogs(func: Function) {
    this.grantFilterLogEvents(func);
    this.addEnvs(func, ENV_NAMES.WORKFLOW_EXECUTION_LOG_GROUP_NAME);
  }

  @grant()
  public grantFilterLogEvents(grantable: IGrantable) {
    this.logGroup.grant(grantable, "logs:FilterLogEvents");
  }

  /**
   * Creating and writing to the {@link Logging.logGroup}
   */
  public configurePutWorkflowExecutionLogs(func: Function) {
    this.grantPutWorkflowExecutionLogs(func);
    this.addEnvs(
      func,
      ENV_NAMES.WORKFLOW_EXECUTION_LOG_GROUP_NAME,
      ENV_NAMES.DEFAULT_LOG_LEVEL
    );
  }

  @grant()
  public grantPutWorkflowExecutionLogs(grantable: IGrantable) {
    this.logGroup.grantWrite(grantable);
  }

  /**
   * Allows starting workflows, finishing tasks, reading workflow status
   * and sending signals to workflows.
   */
  public configureFullControl(func: Function) {
    // WF client
    this.configureStartExecution(func);
    this.configureCompleteExecution(func);
    // Execution Queue Client
    this.configureSubmitExecutionEvents(func);
    this.configureSendSignal(func);
    // Execution Store
    this.configureReadExecutions(func);
    this.configureWriteExecutions(func);
    // Execution History Store
    this.configureReadExecutionHistory(func);
    this.configureWriteExecutionHistory(func);
    // Execution History State Store
    this.configureReadHistoryState(func);
    this.configureWriteHistoryState(func);
  }

  private configureOrchestrator() {
    /**
     * Main Orchestrator
     */
    // Write events to the event history table.
    this.configureWriteExecutionHistory(this.orchestrator);
    // Mark an execution as succeeded or failed
    this.configureCompleteExecution(this.orchestrator);
    // allows the orchestrator to save and load events from the history s3 bucket
    this.configureReadHistoryState(this.orchestrator);
    this.configureWriteHistoryState(this.orchestrator);
    // allows writing logs to the service log stream
    this.configurePutWorkflowExecutionLogs(this.orchestrator);
    /**
     * Call Executor
     */
    // start child executions
    this.configureStartExecution(this.orchestrator);
    // send signals to other executions (or itself, don't judge)
    this.configureSendSignal(this.orchestrator);
    this.props.searchService?.configureSearch(this.orchestrator);
    // emit events to the service
    this.props.eventService.configureEmit(this.orchestrator);
    // start tasks
    this.props.taskService.configureStartTask(this.orchestrator);
    /**
     * Both
     */
    // orchestrator - Schedule workflow timeout
    // command executor - handler timer calls
    this.props.schedulerService.configureScheduleTimer(this.orchestrator);
    /**
     * Access to service name in the orchestrator for metric logging
     */
    this.props.service.configureServiceName(this.orchestrator);
    /**
     * Entity Calls
     */
    this.props.entityService.configureReadWriteEntityTable(this.orchestrator);
    // transactions
    this.props.entityService.configureInvokeTransactions(this.orchestrator);
    /**
     * Bucket Call
     */
    this.props.bucketService.configureReadWriteBuckets(this.orchestrator);
    /**
     * Queue Calls
     */
    this.props.queueService.configureSendMessage(this.orchestrator);
    /**
     * Socket Calls
     */
    this.props.socketService.configureInvokeSocketEndpoints(this.orchestrator);
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.EXECUTION_TABLE_NAME]: () => this.executionsTable.tableName,
    [ENV_NAMES.EXECUTION_HISTORY_TABLE_NAME]: () =>
      this.executionHistoryTable.tableName,
    [ENV_NAMES.EXECUTION_HISTORY_BUCKET]: () => this.history.bucketName,
    [ENV_NAMES.WORKFLOW_QUEUE_URL]: () => this.queue.queueUrl,
    [ENV_NAMES.WORKFLOW_EXECUTION_LOG_GROUP_NAME]: () =>
      this.logGroup.logGroupName,
    [ENV_NAMES.DEFAULT_LOG_LEVEL]: () =>
      this.props.overrides?.logLevel ?? "INFO",
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}
