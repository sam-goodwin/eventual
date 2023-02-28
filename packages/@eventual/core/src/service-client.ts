import type { Execution, ExecutionHandle } from "./execution.js";
import type { CommandInput } from "./http/command.js";
import type {
  EventualService,
  ExecutionHistoryResponse,
  ListExecutionEventsResponse,
  ListExecutionsResponse,
  ListWorkflowsResponse,
  SendActivityFailureRequest,
  SendActivityHeartbeatRequest,
  SendActivityHeartbeatResponse,
  SendActivitySuccessRequest,
} from "./internal/eventual-service.js";
import type { Signal } from "./signals.js";
import type { Workflow, WorkflowInput, WorkflowOptions } from "./workflow.js";

/**
 * Top level Eventual Client used by systems outside of an Eventual Service to interact with it.
 */
export interface EventualServiceClient {
  listWorkflows(): Promise<ListWorkflowsResponse>;

  /**
   * Start a workflow execution
   * @param name Suffix of execution id
   * @param input Workflow parameters
   */
  startExecution<W extends Workflow>(
    request: StartExecutionRequest<W>
  ): Promise<ExecutionHandle<W>>;

  /**
   * Retrieves one or more workflow execution.
   */
  listExecutions(
    request: ListExecutionsRequest
  ): Promise<ListExecutionsResponse>;

  /**
   * Retrieves a single workflow execution.
   */
  getExecution(executionId: string): Promise<Execution | undefined>;

  /**
   * Retrieves the workflow events for an execution.
   */
  getExecutionHistory(
    request: ListExecutionEventsRequest
  ): Promise<ListExecutionEventsResponse>;

  /**
   * Retrieves the workflow history events for an execution.
   *
   * @deprecated use {@link EventualServiceClient.getExecutionHistory}. This API will be removed in the future.
   *
   * TODO: Support the mixed use case of retrieving events and history events from
   *       the {@link EventualServiceClient.getExecutionHistory} API.
   */
  getExecutionWorkflowHistory(
    executionId: string
  ): Promise<ExecutionHistoryResponse>;

  /**
   * Sends a signal to the given execution.
   *
   * The execution may be waiting on a signal or may have a handler registered
   * that runs when the signal is received.
   */
  sendSignal(request: SendSignalRequest): Promise<void>;

  /**
   * Publishes one or more events to the service.
   */
  publishEvents(request: PublishEventsRequest): Promise<void>;

  /**
   * Succeeds an async activity with the given value.
   */
  sendActivitySuccess(request: SendActivitySuccessRequest): Promise<void>;

  /**
   * Fails an async activity causing it to throw the given error.
   */
  sendActivityFailure(request: SendActivityFailureRequest): Promise<void>;

  /**
   * Submits a "heartbeat" for the given activityToken.
   *
   * @returns whether the activity has been cancelled by the calling workflow.
   */
  sendActivityHeartbeat(
    request: SendActivityHeartbeatRequest
  ): Promise<SendActivityHeartbeatResponse>;
}

export interface PublishEventsRequest
  extends CommandInput<EventualService["publishEvents"]> {}

export interface StartExecutionRequest<W extends Workflow = Workflow>
  extends WorkflowOptions {
  /**
   * Name of the workflow execution.
   *
   * Only one workflow can exist for an ID. Requests to start a workflow
   * with the name of an existing workflow will fail.
   *
   * @default - a unique name is generated.
   */
  executionName?: string;
  /**
   * Name of the workflow to execute.
   */
  workflow: string | W;
  /**
   * Input payload for the workflow function.
   */
  input: WorkflowInput<W>;
}

export interface SucceedExecutionRequest<Result = any> {
  executionId: string;
  result?: Result;
  endTime: string;
}

export interface FailExecutionRequest {
  executionId: string;
  error: string;
  message: string;
  endTime: string;
}

export interface ListExecutionsRequest
  extends CommandInput<EventualService["listExecutions"]> {}

export interface ListExecutionEventsRequest
  extends CommandInput<EventualService["getExecutionHistory"]> {}

export interface SendSignalRequest<Payload = any> {
  signal: Signal<Payload> | string;
  execution: ExecutionHandle<any> | string;
  payload?: Payload;
  /**
   * Execution scoped unique event id. Duplicates will be deduplicated.
   */
  id?: string;
}

// re-exports types used by the client, the types are in the internal path otherwise.
export {
  ExecutionHistoryResponse,
  ListExecutionsResponse,
  ListExecutionEventsResponse,
  ListWorkflowsResponse,
  SendActivityFailureRequest,
  SendActivityHeartbeatRequest,
  SendActivityHeartbeatResponse,
  SendActivitySuccessRequest,
};
