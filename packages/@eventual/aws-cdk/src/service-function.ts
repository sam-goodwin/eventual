import { ENV_NAMES } from "@eventual/aws-runtime";
import { ServiceType, SERVICE_TYPE_FLAG } from "@eventual/core";
import {
  Architecture,
  Code,
  Function,
  FunctionProps,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { Service } from "./service";

export interface ServiceFunctionProps
  extends Omit<FunctionProps, "code" | "handler" | "runtime"> {
  serviceType: ServiceType;
  handler?: string;
  runtime?: Runtime;
}

export class ServiceFunction extends Function {
  readonly serviceType: ServiceType;

  constructor(
    readonly service: Service,
    id: string,
    props: ServiceFunctionProps
  ) {
    super(service, id, {
      runtime: Runtime.NODEJS_16_X,
      architecture: Architecture.ARM_64,
      ...props,
      code: Code.fromAsset(service.outDir(props.serviceType)),
      handler: props.handler ?? "index.default",
      environment: {
        ...props.environment,
        NODE_OPTIONS: "--enable-source-maps",
        [SERVICE_TYPE_FLAG]: props.serviceType,
      },
    });
    this.serviceType = props.serviceType;

    // perform grants and register environment variables once the service finalizes construction
    service.onFinalize(() => {
      this.configureEnvironmentVariables();
      this.configurePermissions();
    });
  }

  private configurePermissions() {
    this.service.grantPublish(this);
    this.service.grantStartWorkflow(this);

    if (this.serviceType === ServiceType.ActivityWorker) {
      // the worker emits events back to the orchestrator's event loop
      this.service.workflowQueue.grantSendMessages(this);

      // the worker will issue an UpdateItem command to lock
      this.service.locksTable.grantWriteData(this);
    } else if (this.serviceType === ServiceType.ApiHandler) {
    } else if (this.serviceType === ServiceType.OrchestratorWorker) {
      // the orchestrator can emit workflow tasks when invoking other workflows or inline activities
      this.service.workflowQueue.grantSendMessages(this);

      // the orchestrator asynchronously invokes activities
      this.service.activityWorker.grantInvoke(this);

      // the orchestrator will accumulate history state in S3
      this.service.history.grantReadWrite(this);

      this.service.timerQueue.grantSendMessages(this);
    }
  }

  private configureEnvironmentVariables() {
    Object.entries({
      [ENV_NAMES.ACTIVITY_LOCK_TABLE_NAME]: this.service.locksTable.tableName,

      [ENV_NAMES.EVENT_BUS_ARN]: this.service.eventBus.eventBusArn,
      [ENV_NAMES.EXECUTION_HISTORY_BUCKET]: this.service.history.bucketName,
      [ENV_NAMES.SCHEDULE_FORWARDER_ARN]:
        this.service.scheduleForwarder.functionArn,
      [ENV_NAMES.SCHEDULER_DLQ_ROLE_ARN]: this.service.dlq.queueArn,
      [ENV_NAMES.SCHEDULER_GROUP]: this.service.schedulerGroup.ref,
      [ENV_NAMES.SCHEDULER_ROLE_ARN]: this.service.schedulerRole.roleArn,
      [ENV_NAMES.TABLE_NAME]: this.service.table.tableName,
      [ENV_NAMES.TIMER_QUEUE_URL]: this.service.timerQueue.queueUrl,
      [ENV_NAMES.WORKFLOW_QUEUE_URL]: this.service.workflowQueue.queueUrl,
    }).forEach(([key, value]) => this.addEnvironment(key, value));

    if (this.serviceType === ServiceType.OrchestratorWorker) {
      this.addEnvironment(
        ENV_NAMES.ACTIVITY_WORKER_FUNCTION_NAME,
        this.service.activityWorker.functionName
      );
    }
  }
}
