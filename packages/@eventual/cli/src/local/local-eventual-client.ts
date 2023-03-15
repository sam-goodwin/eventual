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
  SendActivityHeartbeatRequest,
  SendActivityHeartbeatResponse,
  SendActivitySuccessRequest,
  SendSignalRequest,
  StartExecutionRequest,
  Workflow,
} from "@eventual/core";
import { ServiceSpec } from "@eventual/core/internal";

export class LocalEventualClient implements EventualServiceClient {
  constructor(public serviceSpec: ServiceSpec) {}

  async listWorkflows(): Promise<ListWorkflowsResponse> {
    return {
      workflows: this.serviceSpec.workflows.map((wf) => ({ name: wf.name })),
    };
  }

  startExecution<W extends Workflow<any, any>>(
    _request: StartExecutionRequest<W>
  ): Promise<ExecutionHandle<W>> {
    throw new Error("Method not implemented.");
  }
  listExecutions(
    _request: ListExecutionsRequest
  ): Promise<ListExecutionsResponse> {
    throw new Error("Method not implemented.");
  }
  getExecution(_executionId: string): Promise<Execution<any> | undefined> {
    throw new Error("Method not implemented.");
  }
  getExecutionHistory(
    _request: ListExecutionEventsRequest
  ): Promise<ListExecutionEventsResponse> {
    throw new Error("Method not implemented.");
  }
  getExecutionWorkflowHistory(
    _executionId: string
  ): Promise<ExecutionHistoryResponse> {
    throw new Error("Method not implemented.");
  }
  sendSignal(_request: SendSignalRequest<any>): Promise<void> {
    throw new Error("Method not implemented.");
  }
  publishEvents(_request: PublishEventsRequest): Promise<void> {
    throw new Error("Method not implemented.");
  }
  sendActivitySuccess(
    _request: SendActivitySuccessRequest<any>
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  sendActivityFailure(_request: SendActivityFailureRequest): Promise<void> {
    throw new Error("Method not implemented.");
  }
  sendActivityHeartbeat(
    _request: SendActivityHeartbeatRequest
  ): Promise<SendActivityHeartbeatResponse> {
    throw new Error("Method not implemented.");
  }
}
