import {
  EventualServiceClient,
  ExecuteTransactionRequest,
  ExecuteTransactionResponse,
  Execution,
  ExecutionHandle,
  ExecutionHistoryResponse,
  ListExecutionEventsRequest,
  ListExecutionEventsResponse,
  ListExecutionsRequest,
  ListExecutionsResponse,
  ListWorkflowsResponse,
  EmitEventsRequest,
  SendTaskFailureRequest,
  SendTaskHeartbeatResponse,
  SendTaskSuccessRequest,
  SendSignalRequest,
  StartExecutionRequest,
  Transaction,
  Workflow,
} from "@eventual/core";
import {
  EventualService,
  EVENTUAL_SYSTEM_COMMAND_NAMESPACE,
  SendTaskHeartbeatRequest,
} from "@eventual/core/internal";
import { HttpServiceClientProps } from "./base-http-client.js";
import { ServiceClient } from "./service-client.js";

/**
 * Http implementation of the {@link EventualServiceClient} to hit the API deployed
 * with an eventual service.
 *
 * Makes unauthenticated and unsigned requests using fetch to the http endpoint.
 *
 * To authorize and/or sign requests, use the beforeRequest hook or
 * an existing platform specific client. (ex: {@link AwsHttpServiceClient} in @eventual/aws-client)
 */
export class HttpEventualClient implements EventualServiceClient {
  protected readonly serviceClient: ServiceClient<EventualService>;

  constructor(props: HttpServiceClientProps) {
    this.serviceClient = new ServiceClient<EventualService>(
      props,
      EVENTUAL_SYSTEM_COMMAND_NAMESPACE
    );
  }

  public async listWorkflows(): Promise<ListWorkflowsResponse> {
    return this.serviceClient.listWorkflows();
  }

  public async startExecution<W extends Workflow>(
    request: StartExecutionRequest<W>
  ): Promise<ExecutionHandle<W>> {
    // serialize the workflow object to a string
    const workflow =
      typeof request.workflow === "string"
        ? request.workflow
        : request.workflow.name;

    const { executionId } = await this.serviceClient.startExecution({
      workflow,
      input: request.input,
      executionName: request.executionName,
      timeout: request.timeout,
    });

    return new ExecutionHandle(executionId, this);
  }

  public async listExecutions(
    request: ListExecutionsRequest
  ): Promise<ListExecutionsResponse> {
    return this.serviceClient.listExecutions(request);
  }

  public async getExecution(
    executionId: string
  ): Promise<Execution<any> | undefined> {
    return this.serviceClient.getExecution(executionId);
  }

  public async getExecutionHistory(
    request: ListExecutionEventsRequest
  ): Promise<ListExecutionEventsResponse> {
    return this.serviceClient.getExecutionHistory(request);
  }

  public async getExecutionWorkflowHistory(
    executionId: string
  ): Promise<ExecutionHistoryResponse> {
    return this.serviceClient.getExecutionWorkflowHistory(executionId);
  }

  public async sendSignal(request: SendSignalRequest<any>): Promise<void> {
    const { execution, signal, ...rest } = request;
    const signalId = typeof signal === "string" ? signal : signal.id;
    const executionId =
      typeof execution === "string" ? execution : execution.executionId;
    return this.serviceClient.sendSignal({
      ...rest,
      signalId,
      executionId,
    });
  }

  public emitEvents(request: EmitEventsRequest): Promise<void> {
    return this.serviceClient.emitEvents(request);
  }

  public async sendTaskSuccess(
    request: SendTaskSuccessRequest<any>
  ): Promise<void> {
    return (await this.serviceClient.updateTask({
      ...request,
      type: "Success",
    })) as void;
  }

  public async sendTaskFailure(request: SendTaskFailureRequest): Promise<void> {
    return (await this.serviceClient.updateTask({
      ...request,
      type: "Failure",
    })) as void;
  }

  public async sendTaskHeartbeat(
    request: SendTaskHeartbeatRequest
  ): Promise<SendTaskHeartbeatResponse> {
    return (await this.serviceClient.updateTask({
      ...request,
      type: "Heartbeat",
    })) as SendTaskHeartbeatResponse;
  }

  public async executeTransaction<T extends Transaction<any, any>>(
    request: ExecuteTransactionRequest<T>
  ): Promise<ExecuteTransactionResponse<T>> {
    return await this.serviceClient.executeTransaction({
      transactionName:
        typeof request.transaction === "string"
          ? request.transaction
          : request.transaction.name,
      input: request.input,
    });
  }
}
