import {
  EmitEventsRequest,
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
  SendSignalRequest,
  SendTaskFailureRequest,
  SendTaskHeartbeatRequest,
  SendTaskHeartbeatResponse,
  SendTaskSuccessRequest,
  DirectStartExecutionRequest,
  Transaction,
  Workflow,
  WorkflowOutput,
} from "@eventual/core";
import type { WorkflowProvider } from "../providers/workflow-provider.js";
import type { ExecutionHistoryStateStore } from "../stores/execution-history-state-store.js";
import type { ExecutionHistoryStore } from "../stores/execution-history-store.js";
import type { ExecutionStore } from "../stores/execution-store.js";
import type { EventClient } from "./event-client.js";
import type { ExecutionQueueClient } from "./execution-queue-client.js";
import type { TaskClient } from "./task-client.js";
import type { TransactionClient } from "./transaction-client.js";
import type { WorkflowClient } from "./workflow-client.js";
import {
  GetExecutionLogsRequest,
  GetExecutionLogsResponse,
} from "@eventual/core/internal";
import { LogsClient } from "./logs-client.js";

export interface RuntimeServiceClientProps {
  eventClient: EventClient;
  executionHistoryStateStore: ExecutionHistoryStateStore;
  executionHistoryStore: ExecutionHistoryStore;
  executionQueueClient: ExecutionQueueClient;
  executionStore: ExecutionStore;
  logsClient: LogsClient;
  taskClient: TaskClient;
  transactionClient: TransactionClient;
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
    request: DirectStartExecutionRequest<W>
  ): Promise<ExecutionHandle<WorkflowOutput<W>>> {
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

  public getExecutionLogs(
    request: GetExecutionLogsRequest
  ): Promise<GetExecutionLogsResponse> {
    if (!this.props.logsClient) {
      return this.fallbackServiceClient.getExecutionLogs(request);
    }
    return this.props.logsClient.getExecutionLogs(request);
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

  public emitEvents(request: EmitEventsRequest): Promise<void> {
    if (!this.props.eventClient) {
      return this.fallbackServiceClient.emitEvents(request);
    }
    return this.props.eventClient.emitEvents(...request.events);
  }

  public sendTaskSuccess(
    request: Omit<SendTaskSuccessRequest<any>, "type">
  ): Promise<void> {
    if (!this.props.taskClient) {
      return this.fallbackServiceClient.sendTaskSuccess(request);
    }
    return this.props.taskClient.sendSuccess(request);
  }

  public sendTaskFailure(
    request: Omit<SendTaskFailureRequest, "type">
  ): Promise<void> {
    if (!this.props.taskClient) {
      return this.fallbackServiceClient.sendTaskFailure(request);
    }
    return this.props.taskClient.sendFailure(request);
  }

  public sendTaskHeartbeat(
    request: Omit<SendTaskHeartbeatRequest, "type">
  ): Promise<SendTaskHeartbeatResponse> {
    if (!this.props.taskClient) {
      return this.fallbackServiceClient.sendTaskHeartbeat(request);
    }
    return this.props.taskClient.sendHeartbeat(request);
  }

  public async executeTransaction<T extends Transaction<any, any>>(
    request: ExecuteTransactionRequest<T>
  ): Promise<ExecuteTransactionResponse<T>> {
    if (!this.props.transactionClient) {
      return this.fallbackServiceClient.executeTransaction(request);
    }
    return this.props.transactionClient.executeTransaction(request);
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
