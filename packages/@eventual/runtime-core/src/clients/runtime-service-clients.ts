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
  workflows,
} from "@eventual/core";
import { ExecutionHistoryStateStore } from "../stores/execution-history-state-store.js";
import { ExecutionHistoryStore } from "../stores/execution-history-store.js";
import { ExecutionStore } from "../stores/execution-store.js";
import { ActivityClient } from "./activity-client.js";
import { EventClient } from "./event-client.js";
import { ExecutionQueueClient } from "./execution-queue-client.js";
import { WorkflowClient } from "./workflow-client.js";

export interface RuntimeServiceClientProps {
  activityClient: ActivityClient;
  workflowClient: WorkflowClient;
  executionHistoryStore: ExecutionHistoryStore;
  eventClient: EventClient;
  executionStore: ExecutionStore;
  executionQueueClient: ExecutionQueueClient;
  executionHistoryStateStore: ExecutionHistoryStateStore;
}

/**
 * An implementation of the {@link EventualServiceClient} using the eventual runtime clients.
 *
 * Intended to be used when there is direct access to the eventual service internals.
 */
export class RuntimeServiceClient implements EventualServiceClient {
  constructor(private props: RuntimeServiceClientProps) {}

  public async listWorkflows(): Promise<ListWorkflowsResponse> {
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

  public async listExecutions(
    request: ListExecutionsRequest
  ): Promise<ListExecutionsResponse> {
    return this.props.executionStore.list(request);
  }

  public getExecution(
    executionId: string
  ): Promise<Execution<any> | undefined> {
    return this.props.executionStore.get(executionId);
  }

  public getExecutionHistory(
    request: ListExecutionEventsRequest
  ): Promise<ListExecutionEventsResponse> {
    return this.props.executionHistoryStore.getEvents(request);
  }

  public async getExecutionWorkflowHistory(
    executionId: string
  ): Promise<ExecutionHistoryResponse> {
    const events = await this.props.executionHistoryStateStore.getHistory(
      executionId
    );
    return {
      events,
    };
  }

  public async sendSignal(request: SendSignalRequest): Promise<void> {
    return this.props.executionQueueClient.sendSignal(request);
  }

  public publishEvents(request: PublishEventsRequest): Promise<void> {
    return this.props.eventClient.publishEvents(...request.events);
  }

  public sendActivitySuccess(
    request: Omit<SendActivitySuccessRequest<any>, "type">
  ): Promise<void> {
    return this.props.activityClient.sendSuccess(request);
  }

  public sendActivityFailure(
    request: Omit<SendActivityFailureRequest, "type">
  ): Promise<void> {
    return this.props.activityClient.sendFailure(request);
  }

  public sendActivityHeartbeat(
    request: Omit<SendActivityHeartbeatRequest, "type">
  ): Promise<SendActivityHeartbeatResponse> {
    return this.props.activityClient.sendHeartbeat(request);
  }
}
