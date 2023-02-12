import { ENV_NAMES, ExecutionInsertEventRecord, ExecutionRecord } from "@eventual/aws-runtime";
import { ExecutionQueueEventEnvelope } from "@eventual/runtime-core";
import { CfnResource, RemovalPolicy } from "aws-cdk-lib";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { IGrantable, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Function } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import {
  DeduplicationScope,
  FifoThroughputLimit,
  IQueue,
  Queue,
} from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { IActivities } from "./activities";
import type { BuildOutput } from "./build";
import { Events } from "./events";
import { grant } from "./grant";
import { Logging } from "./logging";
import { IScheduler } from "./scheduler";
import { IService } from "./service";
import { ServiceFunction } from "./service-function";

export interface WorkflowsProps {
  build: BuildOutput;
  serviceName: string;
  scheduler: IScheduler;
  activities: IActivities;
  table: ITable;
  events: Events<any>;
  logging: Logging;
  orchestrator?: {
    reservedConcurrentExecutions?: number;
  };
  service: IService;
}

export interface IWorkflows {
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
}

/**
 * Subsystem which manages and orchestrates workflows and workflow executions.
 */
export class Workflows extends Construct implements IWorkflows, IGrantable {
  public readonly orchestrator: Function;
  public readonly queue: IQueue;
  public readonly history: IBucket;

  constructor(scope: Construct, id: string, private props: WorkflowsProps) {
    super(scope, id);

    this.history = new Bucket(scope, "History", {
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.queue = new Queue(scope, "Queue", {
      fifo: true,
      fifoThroughputLimit: FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
      deduplicationScope: DeduplicationScope.MESSAGE_GROUP,
      contentBasedDeduplication: true,
    });

    this.orchestrator = new ServiceFunction(this, "Orchestrator", {
      functionName: `${props.serviceName}-orchestrator-handler`,
      code: props.build.getCode(props.build.orchestrator.file),
      events: [
        new SqsEventSource(this.queue, {
          batchSize: 10,
          reportBatchItemFailures: true,
        }),
      ],
    });

    const starterRole = new Role(this, "StarterRole", {
      assumedBy: new ServicePrincipal("pipes"),
    });

    this.queue.grantSendMessages(starterRole);
    this.props.table.grantStreamRead(starterRole);

    new CfnResource(this, "Starter", {
      type: "AWS::Pipes::Pipe",
      properties: {
        TargetParameters: {
          SqsQueueParameters: {
            MessageGroupId: "$.dynamodb.NewImage.id.S",
          },
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
          InputTemplate: JSON.stringify({
            task: {
              events: ["<$.dynamodb.NewImage.insertEvent.S>"],
              executionId: "<$.dynamodb.NewImage.id.S>",
            },
          } satisfies ExecutionQueueEventEnvelope),
        },
        Name: `${props.serviceName}-execution-starter`,
        RoleArn: starterRole.roleArn,
        Source: this.props.table.tableStreamArn,
        SourceParameters: {
          // TODO: DLQ - though the retry is infinite, can this happen?
          DynamoDBStreamParameters: {
            StartingPosition: "LATEST",
            // do not wait for multiple records, just go.
            BatchSize: 1,
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
                        S: [
                          ExecutionRecord.PARTITION_KEY,
                          ExecutionInsertEventRecord.PARTITION_KEY,
                        ],
                      },
                      [ExecutionRecord.INSERT_EVENT]: { S: [{ exists: true }] },
                    },
                  },
                }),
              },
            ],
          },
        },
        Target: this.queue.queueArn,
      },
    });

    this.configureOrchestrator();
  }

  public get grantPrincipal() {
    return this.orchestrator.grantPrincipal;
  }

  /**
   * Workflow Client
   */

  public configureStartExecution(func: Function) {
    this.configureReadExecutions(func);
    this.configureWriteExecutions(func);
    // when we start a workflow, we create the log stream it will use.
    this.props.logging.configurePutServiceLogs(func);
    this.configureSubmitExecutionEvents(func);
  }

  @grant()
  public grantStartExecution(grantable: IGrantable) {
    this.grantReadExecutions(grantable);
    this.grantWriteExecutions(grantable);
    // when we start a workflow, we create the log stream it will use.
    this.props.logging.grantPutServiceLogs(grantable);
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
    this.props.logging.configurePutServiceLogs(this.orchestrator);
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
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}
