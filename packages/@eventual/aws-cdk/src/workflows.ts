import { ENV_NAMES, ExecutionRecord } from "@eventual/aws-runtime";
import { LogLevel } from "@eventual/core";
import { ExecutionQueueEventEnvelope } from "@eventual/core-runtime";
import { CfnResource, RemovalPolicy } from "aws-cdk-lib";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { IGrantable, IRole, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
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
import { Construct } from "constructs";
import { IActivities } from "./activities";
import { Events } from "./events";
import { grant } from "./grant";
import { IScheduler } from "./scheduler";
import { ServiceConstructProps } from "./service";
import { ServiceFunction } from "./service-function";

export interface WorkflowsProps
  extends WorkflowOverrides,
    ServiceConstructProps {
  activities: IActivities;
  events: Events;
  scheduler: IScheduler;
  table: ITable;
}

export interface WorkflowOverrides {
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
  grant: (grantable: IRole) => void;
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
  sourceProps: {
    FilterCriteria?: { Filters: { Pattern: string }[] };
    [key: string]: any;
  };
}

export interface IWorkflows {
  /**
   * Creates an Event Bridge Pipe from a valid Pipe source to the Workflow Queue.
   *
   * Intended to pipe {@link HistoryStateEvent}s to the workflow in a serverless way.
   * For example, reacting to an execution being created or updated to send the event durably
   * on the dynamo put/write.
   *
   * Sources: https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-pipes-event-source.html
   *
   * Which
   */
  pipeToWorkflowQueue(
    scope: Construct,
    id: string,
    props: PipeToWorkflowQueueProps
  ): void;

  configureStartExecution(func: Function): void;
  grantStartExecution(grantable: IGrantable): void;

  /**
   * * {@link WorkflowClient.succeedExecution}
   * * {@link WorkflowClient.failExecution}
   */
  configureCompleteExecution(func: Function): void;
  /**
   * * {@link WorkflowClient.succeedExecution}
   * * {@link WorkflowClient.failExecution}
   */
  grantCompleteExecution(grantable: IGrantable): void;

  /**
   * Directly submit to the workflow queue.
   *
   * @internal
   */
  configureSubmitExecutionEvents(func: Function): void;
  /**
   * Directly submit to the workflow queue.
   *
   * @internal
   */
  grantSubmitExecutionEvents(grantable: IGrantable): void;

  configureSendSignal(func: Function): void;
  grantSendSignal(grantable: IGrantable): void;

  /**
   * * {@link ExecutionStore.listExecutions}
   * * {@link ExecutionStore.getExecution}
   */
  configureReadExecutions(func: Function): void;
  /**
   * * {@link ExecutionStore.listExecutions}
   * * {@link ExecutionStore.getExecution}
   */
  grantReadExecutions(grantable: IGrantable): void;

  configureWriteExecutions(func: Function): void;
  grantWriteExecutions(grantable: IGrantable): void;

  configureReadExecutionHistory(func: Function): void;
  grantReadExecutionHistory(grantable: IGrantable): void;

  configureWriteExecutionHistory(func: Function): void;
  grantWriteExecutionHistory(grantable: IGrantable): void;

  configureReadHistoryState(func: Function): void;
  grantReadHistoryState(grantable: IGrantable): void;

  configureWriteHistoryState(func: Function): void;
  grantWriteHistoryState(grantable: IGrantable): void;

  configureFullControl(func: Function): void;

  grantFilterLogEvents(grantable: IGrantable): void;

  /**
   * Creating and writing to the {@link Workflows.logGroup}
   */
  configurePutWorkflowExecutionLogs(func: Function): void;
  grantPutWorkflowExecutionLogs(grantable: IGrantable): void;
}

/**
 * Subsystem which manages and orchestrates workflows and workflow executions.
 */
export class Workflows implements IWorkflows {
  public readonly orchestrator: Function;
  public readonly queue: IQueue;
  public readonly history: IBucket;
  public readonly logGroup: LogGroup;

  constructor(private props: WorkflowsProps) {
    // creates the System => Workflow scope.
    const workflowServiceScope = new Construct(
      props.systemScope,
      "WorkflowService"
    );

    // TODO: move in the table

    this.logGroup =
      props.logGroup ??
      new LogGroup(props.serviceScope, "WorkflowExecutionLogs", {
        removalPolicy: RemovalPolicy.DESTROY,
        logGroupName: `${props.serviceName}-execution-logs`,
      });

    this.history = new Bucket(workflowServiceScope, "HistoryBucket", {
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

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
        bundledFunction: props.build.workflows.orchestrator,
        overrides: {
          environment: props.environment,
          events: [
            new SqsEventSource(this.queue, {
              batchSize: 10,
              reportBatchItemFailures: true,
            }),
          ],
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
      grant: (role) => this.props.table.grantStreamRead(role),
      source: this.props.table.tableStreamArn!,
      sourceProps: {
        // will retry forever in the case of an SQS outage!
        DynamoDBStreamParameters: {
          StartingPosition: "LATEST",
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
    const container = new Construct(scope, id);

    const pipeRole = new Role(container, `Role`, {
      assumedBy: new ServicePrincipal("pipes"),
    });

    this.queue.grantSendMessages(pipeRole);
    props.grant(pipeRole);

    new CfnResource(container, "Pipe", {
      type: "AWS::Pipes::Pipe",
      properties: {
        Name: `${this.props.serviceName}-${id}`,
        RoleArn: pipeRole.roleArn,
        Source: props.source,
        SourceParameters: props.sourceProps,
        Target: this.queue.queueArn,
        TargetParameters: {
          SqsQueueParameters: {
            MessageGroupId: props.executionIdPath,
          },
          InputTemplate: `{"task": { "events": [${props.event}], "executionId": <${props.executionIdPath}> } }`,
        },
      },
    });
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
    this.addEnvs(func, ENV_NAMES.TABLE_NAME);
  }

  @grant()
  public grantReadExecutions(grantable: IGrantable) {
    this.props.table.grantReadData(grantable);
  }

  public configureWriteExecutions(func: Function) {
    this.grantWriteExecutions(func);
    this.addEnvs(func, ENV_NAMES.TABLE_NAME);
  }

  @grant()
  public grantWriteExecutions(grantable: IGrantable) {
    this.props.table.grantWriteData(grantable);
  }

  /**
   * Execution History Store Configurations
   */

  public configureReadExecutionHistory(func: Function) {
    this.grantReadExecutionHistory(func);
    this.addEnvs(func, ENV_NAMES.TABLE_NAME);
  }

  @grant()
  public grantReadExecutionHistory(grantable: IGrantable) {
    this.props.table.grantReadData(grantable);
  }

  public configureWriteExecutionHistory(func: Function) {
    this.grantWriteExecutionHistory(func);
    this.addEnvs(func, ENV_NAMES.TABLE_NAME);
  }

  @grant()
  public grantWriteExecutionHistory(grantable: IGrantable) {
    this.props.table.grantWriteData(grantable);
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
   * Allows starting workflows, finishing activities, reading workflow status
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
     * Command Executor
     */
    // start child executions
    this.configureStartExecution(this.orchestrator);
    // send signals to other executions (or itself, don't judge)
    this.configureSendSignal(this.orchestrator);
    // publish events to the service
    this.props.events.configurePublish(this.orchestrator);
    // start activities
    this.props.activities.configureStartActivity(this.orchestrator);
    /**
     * Both
     */
    // orchestrator - Schedule workflow timeout
    // command executor - handler timer commands
    this.props.scheduler.configureScheduleTimer(this.orchestrator);
    /**
     * Access to service name in the orchestrator for metric logging
     */
    this.props.service.configureServiceName(this.orchestrator);
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.TABLE_NAME]: () => this.props.table.tableName,
    [ENV_NAMES.EXECUTION_HISTORY_BUCKET]: () => this.history.bucketName,
    [ENV_NAMES.WORKFLOW_QUEUE_URL]: () => this.queue.queueUrl,
    [ENV_NAMES.WORKFLOW_EXECUTION_LOG_GROUP_NAME]: () =>
      this.logGroup.logGroupName,
    [ENV_NAMES.DEFAULT_LOG_LEVEL]: () => this.props.logLevel ?? "INFO",
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}
