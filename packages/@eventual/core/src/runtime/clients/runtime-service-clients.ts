import {
  SendActivitySuccessRequest,
  EventualServiceClient,
  ExecutionEventsRequest,
  ExecutionEventsResponse,
  ExecutionHistoryResponse,
  SendActivityFailureRequest,
  GetExecutionsRequest,
  GetExecutionsResponse,
  GetWorkflowResponse,
  SendActivityHeartbeatRequest,
  PublishEventsRequest,
  StartExecutionRequest,
  SendActivityHeartbeatResponse,
} from "../../service-client.js";
import { Execution, ExecutionHandle } from "../../execution.js";
import { Workflow } from "../../workflow.js";
import { EventClient } from "./event-client.js";
import { ExecutionHistoryClient } from "./execution-history-client.js";
import { SendSignalRequest, WorkflowClient } from "./workflow-client.js";
import { WorkflowRuntimeClient } from "./workflow-runtime-client.js";
import { workflows } from "../../global.js";

export interface RuntimeServiceClientProps {
  workflowClient: WorkflowClient;
  executionHistoryClient: ExecutionHistoryClient;
  eventClient: EventClient;
  workflowRuntimeClient: WorkflowRuntimeClient;
}

/**
 * An implementation of the {@link EventualServiceClient} using the eventual runtime clients.
 *
 * Intended to be used when there is direct access to the eventual service internals.
 */
export class RuntimeServiceClient implements EventualServiceClient {
  constructor(private props: RuntimeServiceClientProps) {}

  public async getWorkflows(): Promise<GetWorkflowResponse> {
    return {
      workflows: Array.from(workflows().keys()).map((k) => ({ name: k })),
    };
  }

  public async startExecution<W extends Workflow = Workflow>(
    request: StartExecutionRequest<W>
  ): Promise<ExecutionHandle<W>> {
    const { executionId } = await this.props.workflowClient.startExecution<W>(
      request
    );
    return new ExecutionHandle(executionId, this);
  }

  public async getExecutions(
    request: GetExecutionsRequest
  ): Promise<GetExecutionsResponse> {
    return this.props.workflowClient.getExecutions(request);
  }

  public getExecution(
    executionId: string
  ): Promise<Execution<any> | undefined> {
    return this.props.workflowClient.getExecution(executionId);
  }

  public getExecutionHistory(
    request: ExecutionEventsRequest
  ): Promise<ExecutionEventsResponse> {
    return this.props.executionHistoryClient.getEvents(request);
  }

  public async getExecutionWorkflowHistory(
    executionId: string
  ): Promise<ExecutionHistoryResponse> {
    const events = await this.props.workflowRuntimeClient.getHistory(
      executionId
    );
    return {
      events,
    };
  }

  public async sendSignal(request: SendSignalRequest): Promise<void> {
    return this.props.workflowClient.sendSignal(request);
  }

  public publishEvents(request: PublishEventsRequest): Promise<void> {
    return this.props.eventClient.publishEvents(...request.events);
  }

  public sendActivitySuccess(
    request: Omit<SendActivitySuccessRequest<any>, "type">
  ): Promise<void> {
    return this.props.workflowClient.sendActivitySuccess(request);
  }

  public sendActivityFailure(
    request: Omit<SendActivityFailureRequest, "type">
  ): Promise<void> {
    return this.props.workflowClient.sendActivityFailure(request);
  }

  public sendActivityHeartbeat(
    request: Omit<SendActivityHeartbeatRequest, "type">
  ): Promise<SendActivityHeartbeatResponse> {
    return this.props.workflowClient.sendActivityHeartbeat(request);
  }
}
