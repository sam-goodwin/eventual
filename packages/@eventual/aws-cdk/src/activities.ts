import { ENV_NAMES } from "@eventual/aws-runtime";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  ITable,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { addEnvironment } from "./utils";
import { IWorkflows } from "./workflows";
import { Function } from "aws-cdk-lib/aws-lambda";
import { IScheduler } from "./scheduler";
import { ServiceFunction } from "./service-function";
import { Events } from "./events";
import { Logging } from "./logging";
import { IService } from "./service";
import type { BuildOutput } from "./build";
import { IServiceApi } from "./service-api";
import { grant } from "./grant";
import { IQueue, Queue } from "aws-cdk-lib/aws-sqs";
import { SqsDestination } from "aws-cdk-lib/aws-lambda-destinations";
import { ActivityCompletionResultType } from "@eventual/runtime-core";

export interface ActivitiesProps {
  build: BuildOutput;
  serviceName: string;
  workflows: IWorkflows;
  scheduler: IScheduler;
  environment?: Record<string, string>;
  events: Events<any>;
  logging: Logging;
  service: IService;
  readonly api: IServiceApi;
}

export interface IActivities {
  configureStartActivity(func: Function): void;
  grantStartActivity(grantable: IGrantable): void;

  configureSendHeartbeat(func: Function): void;
  grantSendHeartbeat(grantable: IGrantable): void;

  /**
   * {@link ActivitiesClient.sendSuccess} or {@link ActivitiesClient.sendFailure} for an activity.
   */
  configureCompleteActivity(func: Function): void;
  /**
   * {@link ActivitiesClient.sendSuccess} or {@link ActivitiesClient.sendFailure} for an activity.
   */
  grantCompleteActivity(grantable: IGrantable): void;

  configureReadActivities(func: Function): void;
  grantReadActivities(grantable: IGrantable): void;

  /**
   * Claim, Heartbeat, or Cancel an activity.
   *
   * Note: For the full heartbeat, use grantSendHeartbeat.
   */
  configureWriteActivities(func: Function): void;
  /**
   * Claim, Heartbeat, or Cancel an activity.
   *
   * Note: For the full heartbeat, use grantSendHeartbeat.
   */
  grantWriteActivities(grantable: IGrantable): void;

  configureFullControl(func: Function): void;
  grantFullControl(grantable: IGrantable): void;
}

/**
 * Subsystem which supports durable activities.
 *
 * Activities are started by the {@link Workflow.orchestrator} and send back {@link WorkflowEvent}s on completion.
 */
export class Activities
  extends Construct
  implements IActivities, IGrantable, IActivities
{
  /**
   * Table which contains activity information for claiming, heartbeat, and cancellation.
   */
  public table: ITable;
  /**
   * Function which executes all activities. The worker is invoked by the {@link Workflows.orchestrator}.
   */
  public worker: Function;
  /**
   * Activity results are placed in a queue to be processed and sent to the workflow.
   */
  public resultQueue: IQueue;

  constructor(scope: Construct, id: string, private props: ActivitiesProps) {
    super(scope, id);

    this.table = new Table(this, "Table", {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
      // TODO: remove after testing
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.resultQueue = new Queue(this, "ResultQueue");

    this.worker = new ServiceFunction(this, "Worker", {
      code: props.build.getCode(props.build.activities.file),
      functionName: `${props.serviceName}-activity-handler`,
      memorySize: 512,
      // retry attempts should be handled with a new request and a new retry count in accordance with the user's retry policy.
      retryAttempts: 0,
      // TODO: determine worker timeout strategy
      timeout: Duration.minutes(1),
      // when the activity completes, the results are put in the queue to be durably sent to the workflow
      onSuccess: new SqsDestination(this.resultQueue),
    });

    this.props.workflows.pipeToWorkflowQueue("CompletionPipe", {
      grant: (role) => this.resultQueue.grantConsumeMessages(role),
      source: this.resultQueue.queueArn,
      eventPath: "$.body.responsePayload.event",
      executionIdPath: "$.body.responsePayload.executionId",
      sourceProps: {
        FilterCriteria: {
          Filters: [
            {
              Pattern: JSON.stringify({
                body: {
                  responsePayload: {
                    type: [ActivityCompletionResultType.DURABLE_COMPLETION],
                    executionId: [{ exists: true }],
                  },
                },
              }),
            },
          ],
        },
      },
    });

    this.configureActivityWorker();
  }

  public get grantPrincipal() {
    return this.worker.grantPrincipal;
  }

  /**
   * Activity Client
   */

  public configureStartActivity(func: Function) {
    this.grantStartActivity(func);
    this.addEnvs(func, ENV_NAMES.ACTIVITY_WORKER_FUNCTION_NAME);
  }

  @grant()
  public grantStartActivity(grantable: IGrantable) {
    this.worker.grantInvoke(grantable);
  }

  public configureSendHeartbeat(func: Function) {
    this.props.workflows.configureReadExecutions(func);
    this.configureWriteActivities(func);
  }

  @grant()
  public grantSendHeartbeat(grantable: IGrantable) {
    this.props.workflows.grantReadExecutions(grantable);
    this.grantWriteActivities(grantable);
  }

  public configureCompleteActivity(func: Function) {
    this.props.workflows.configureSubmitExecutionEvents(func);
    this.grantCompleteActivity(func);
  }

  @grant()
  public grantCompleteActivity(grantable: IGrantable) {
    this.props.workflows.grantSubmitExecutionEvents(grantable);
  }

  /**
   * Activity Store Configuration
   */

  public configureReadActivities(func: Function) {
    this.grantReadActivities(func);
    this.addEnvs(func, ENV_NAMES.ACTIVITY_TABLE_NAME);
  }

  @grant()
  public grantReadActivities(grantable: IGrantable) {
    this.table.grantReadData(grantable);
  }

  public configureWriteActivities(func: Function) {
    this.grantWriteActivities(func);
    this.addEnvs(func, ENV_NAMES.ACTIVITY_TABLE_NAME);
  }

  @grant()
  public grantWriteActivities(grantable: IGrantable) {
    this.table.grantWriteData(grantable);
  }

  public configureFullControl(func: Function): void {
    this.configureStartActivity(func);
    this.configureSendHeartbeat(func);
    this.configureCompleteActivity(func);
    this.configureReadActivities(func);
    this.configureWriteActivities(func);
  }

  @grant()
  public grantFullControl(grantable: IGrantable): void {
    this.grantStartActivity(grantable);
    this.grantSendHeartbeat(grantable);
    this.grantCompleteActivity(grantable);
    this.grantReadActivities(grantable);
    this.grantWriteActivities(grantable);
  }

  private configureActivityWorker() {
    // claim activities
    this.configureWriteActivities(this.worker);
    // report result back to the execution
    this.props.workflows.configureSubmitExecutionEvents(this.worker);
    // send logs to the execution log stream
    this.props.logging.configurePutServiceLogs(this.worker);
    // start heartbeat monitor
    this.props.scheduler.configureScheduleTimer(this.worker);

    if (this.props.environment) {
      addEnvironment(this.worker, this.props.environment);
    }

    // allows access to any of the injected service client operations.
    this.props.service.configureForServiceClient(this.worker);
    this.props.api.configureInvokeHttpServiceApi(this.worker);
    /**
     * Access to service name in the activity worker for metrics logging
     */
    this.props.service.configureServiceName(this.worker);
  }

  private readonly ENV_MAPPINGS = {
    [ENV_NAMES.ACTIVITY_TABLE_NAME]: () => this.table.tableName,
    [ENV_NAMES.ACTIVITY_WORKER_FUNCTION_NAME]: () => this.worker.functionName,
  } as const;

  private addEnvs(func: Function, ...envs: (keyof typeof this.ENV_MAPPINGS)[]) {
    envs.forEach((env) => func.addEnvironment(env, this.ENV_MAPPINGS[env]()));
  }
}
