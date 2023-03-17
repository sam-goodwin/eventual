import {
  EventualServiceClient,
  Execution,
  ExecutionHandle,
  ExecutionHistoryResponse,
  ListExecutionEventsRequest,
  ListExecutionEventsResponse,
  ListExecutionsRequest,
  ListExecutionsResponse,
  ListWorkflowsResponse,
  PublishEventsRequest,
  SendActivityFailureRequest,
  SendActivityHeartbeatResponse,
  SendActivitySuccessRequest,
  SendSignalRequest,
  StartExecutionRequest,
  Workflow,
} from "@eventual/core";
import {
  EventualService,
  EVENTUAL_SYSTEM_COMMAND_NAMESPACE,
  SendActivityHeartbeatRequest,
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

  public async startExecution<W extends Workflow<any, any>>(
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

  public publishEvents(request: PublishEventsRequest): Promise<void> {
    return this.serviceClient.publishEvents(request);
  }

  public async sendActivitySuccess(
    request: SendActivitySuccessRequest<any>
  ): Promise<void> {
    return (await this.serviceClient.updateActivity({
      ...request,
      type: "Success",
    })) as void;
  }

  public async sendActivityFailure(
    request: SendActivityFailureRequest
  ): Promise<void> {
    return (await this.serviceClient.updateActivity({
      ...request,
      type: "Failure",
    })) as void;
  }

  public async sendActivityHeartbeat(
    request: SendActivityHeartbeatRequest
  ): Promise<SendActivityHeartbeatResponse> {
    return (await this.serviceClient.updateActivity({
      ...request,
      type: "Heartbeat",
    })) as SendActivityHeartbeatResponse;
  }
}
