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
import { WorkflowProvider } from "../providers/workflow-provider.js";
import { ExecutionHistoryStateStore } from "../stores/execution-history-state-store.js";
import { ExecutionHistoryStore } from "../stores/execution-history-store.js";
import { ExecutionStore } from "../stores/execution-store.js";
import { ActivityClient } from "./activity-client.js";
import { EventClient } from "./event-client.js";
import { ExecutionQueueClient } from "./execution-queue-client.js";
import { WorkflowClient } from "./workflow-client.js";

export interface RuntimeServiceClientProps {
  activityClient: ActivityClient;
  eventClient: EventClient;
  executionHistoryStateStore: ExecutionHistoryStateStore;
  executionHistoryStore: ExecutionHistoryStore;
  executionQueueClient: ExecutionQueueClient;
  executionStore: ExecutionStore;
  workflowClient: WorkflowClient;
  workflowProvider: WorkflowProvider;
}

/**
 * An implementation of the {@link EventualServiceClient} using the eventual runtime clients
 * but can fallback to another client like an http client for some operations.
 *
 * Intended to be used when there is direct access to the eventual service internals,
 * but allows the choice use another client impl (like http) in some cases.
 */
export class RuntimeFallbackServiceClient implements EventualServiceClient {
  constructor(
    private props: Partial<RuntimeServiceClientProps>,
    private fallbackServiceClient: EventualServiceClient
  ) {}

  public async listWorkflows(): Promise<ListWorkflowsResponse> {
    if (!this.props.workflowProvider) {
      return this.fallbackServiceClient.listWorkflows();
    }
    return {
      workflows: Array.from(this.props.workflowProvider.getWorkflowNames()).map(
        (k) => ({ name: k })
      ),
    };
  }

  public async startExecution<W extends Workflow = Workflow>(
    request: StartExecutionRequest<W>
  ): Promise<ExecutionHandle<W>> {
    if (!this.props.workflowClient) {
      return this.fallbackServiceClient.startExecution(request);
    }
    const { executionId } = await this.props.workflowClient.startExecution<W>(
      request
    );
    return new ExecutionHandle(executionId, this);
  }

  public async listExecutions(
    request: ListExecutionsRequest
  ): Promise<ListExecutionsResponse> {
    if (!this.props.executionStore) {
      return this.fallbackServiceClient.listExecutions(request);
    }
    return this.props.executionStore.list(request);
  }

  public getExecution(
    executionId: string
  ): Promise<Execution<any> | undefined> {
    if (!this.props.executionStore) {
      return this.fallbackServiceClient.getExecution(executionId);
    }
    return this.props.executionStore.get(executionId);
  }

  public getExecutionHistory(
    request: ListExecutionEventsRequest
  ): Promise<ListExecutionEventsResponse> {
    if (!this.props.executionHistoryStore) {
      return this.fallbackServiceClient.getExecutionHistory(request);
    }
    return this.props.executionHistoryStore.getEvents(request);
  }

  public async getExecutionWorkflowHistory(
    executionId: string
  ): Promise<ExecutionHistoryResponse> {
    if (!this.props.executionHistoryStateStore) {
      return this.fallbackServiceClient.getExecutionWorkflowHistory(
        executionId
      );
    }
    const events = await this.props.executionHistoryStateStore.getHistory(
      executionId
    );
    return {
      events,
    };
  }

  public async sendSignal(request: SendSignalRequest): Promise<void> {
    if (!this.props.executionQueueClient) {
      return this.fallbackServiceClient.sendSignal(request);
    }
    return this.props.executionQueueClient.sendSignal(request);
  }

  public publishEvents(request: PublishEventsRequest): Promise<void> {
    if (!this.props.eventClient) {
      return this.fallbackServiceClient.publishEvents(request);
    }
    return this.props.eventClient.publishEvents(...request.events);
  }

  public sendActivitySuccess(
    request: Omit<SendActivitySuccessRequest<any>, "type">
  ): Promise<void> {
    if (!this.props.activityClient) {
      return this.fallbackServiceClient.sendActivitySuccess(request);
    }
    return this.props.activityClient.sendSuccess(request);
  }

  public sendActivityFailure(
    request: Omit<SendActivityFailureRequest, "type">
  ): Promise<void> {
    if (!this.props.activityClient) {
      return this.fallbackServiceClient.sendActivityFailure(request);
    }
    return this.props.activityClient.sendFailure(request);
  }

  public sendActivityHeartbeat(
    request: Omit<SendActivityHeartbeatRequest, "type">
  ): Promise<SendActivityHeartbeatResponse> {
    if (!this.props.activityClient) {
      return this.fallbackServiceClient.sendActivityHeartbeat(request);
    }
    return this.props.activityClient.sendHeartbeat(request);
  }
}

/**
 * An implementation of the {@link EventualServiceClient} using the eventual runtime clients.
 *
 * Intended to be used when there is direct access to the eventual service internals.
 */
export class RuntimeServiceClient extends RuntimeFallbackServiceClient {
  constructor(_props: RuntimeServiceClientProps) {
    super(_props, {} as EventualServiceClient);
  }
}
