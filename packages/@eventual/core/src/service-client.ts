import { EventEnvelope } from "./event.js";
import { Execution, ExecutionHandle, ExecutionStatus } from "./execution.js";
import {
  CompleteActivityRequest,
  FailActivityRequest,
  HeartbeatRequest,
  HeartbeatResponse,
  SendSignalRequest,
} from "./runtime/clients/workflow-client.js";
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
  getExecutions(request: GetExecutionsRequest): Promise<GetExecutionsResponse>;

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
   * Successfully Completes an async activity with the given value.
   */
  sendActivitySuccess(request: CompleteActivityRequest): Promise<void>;

  /**
   * Fails an async activity causing it to throw the given error.
   */
  sendActivityFailure(request: FailActivityRequest): Promise<void>;

  /**
   * Submits a "heartbeat" for the given activityToken.
   *
   * @returns whether the activity has been cancelled by the calling workflow.
   */
  sendActivityHeartbeat(request: HeartbeatRequest): Promise<HeartbeatResponse>;
}

export interface StartExecutionResponse {
  executionId: string;
}

export interface GetExecutionsRequest {
  statuses?: ExecutionStatus[];
  workflowName?: string;
  nextToken?: string;
  /**
   * @default "Asc"
   */
  sortDirection?: SortOrder;
  /**
   * @default: 100
   */
  maxResults?: number;
}

export interface GetExecutionsResponse {
  executions: Execution[];
  /**
   * A token returned when there may be more executions to retrieve.
   */
  nextToken?: string;
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
}

export interface ExecutionEventsResponse {
  events: WorkflowEvent[];
  nextToken?: string;
}

export interface ExecutionHistoryResponse {
  events: HistoryStateEvent[];
}

export type SortOrder = "Asc" | "Desc";

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
