import { EventEnvelope } from "./event.js";
import { Execution, ExecutionHandle } from "./execution.js";
import {
  SendActivityFailureRequest,
  SendActivityHeartbeatRequest,
  SendActivityHeartbeatResponse,
  SendActivitySuccessRequest,
} from "./runtime/clients/activity-client.js";
import { SendSignalRequest } from "./runtime/clients/execution-queue-client.js";
import { ExecutionID } from "./runtime/execution-id.js";
import {
  ListExecutionsRequest,
  ListExecutionsResponse,
} from "./runtime/stores/execution-store.js";
import { HistoryStateEvent, WorkflowEvent } from "./workflow-events.js";
import { Workflow, WorkflowInput, WorkflowOptions } from "./workflow.js";

/**
 * Top level Eventual Client used by systems outside of an Eventual Service to interact with it.
 */
export interface EventualServiceClient {
  getWorkflows(): Promise<GetWorkflowResponse>;

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
  getExecutions(
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
    request: ExecutionEventsRequest
  ): Promise<ExecutionEventsResponse>;

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
  sendActivitySuccess(
    request: Omit<SendActivitySuccessRequest, "type">
  ): Promise<void>;

  /**
   * Fails an async activity causing it to throw the given error.
   */
  sendActivityFailure(
    request: Omit<SendActivityFailureRequest, "type">
  ): Promise<void>;

  /**
   * Submits a "heartbeat" for the given activityToken.
   *
   * @returns whether the activity has been cancelled by the calling workflow.
   */
  sendActivityHeartbeat(
    request: Omit<SendActivityHeartbeatRequest, "type">
  ): Promise<SendActivityHeartbeatResponse>;
}

export interface StartExecutionResponse {
  /**
   * ID of the started workflow execution.
   */
  executionId: ExecutionID;
}

export interface PublishEventsRequest {
  events: EventEnvelope<any>[];
}

export interface ExecutionEventsRequest {
  executionId: string;
  /**
   * @default "Asc"
   */
  sortDirection?: SortOrder;
  nextToken?: string;
  /**
   * @default: 100
   */
  maxResults?: number;
  /**
   * Start returning results after a date.
   */
  after?: string;
}

export interface ExecutionEventsResponse {
  events: WorkflowEvent[];
  nextToken?: string;
}

export interface ExecutionHistoryResponse {
  events: HistoryStateEvent[];
}

export enum SortOrder {
  Asc = "ASC",
  Desc = "DESC",
}

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

export interface WorkflowReference {
  name: string;
}

export interface GetWorkflowResponse {
  workflows: WorkflowReference[];
}
