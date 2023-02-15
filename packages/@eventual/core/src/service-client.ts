import { EventEnvelope } from "./event.js";
import { ExecutionID } from "./execution-id.js";
import { Execution, ExecutionHandle, ExecutionStatus } from "./execution.js";
import { Signal } from "./signals.js";
import { HistoryStateEvent, WorkflowEvent } from "./workflow-events.js";
import { Workflow, WorkflowInput, WorkflowOptions } from "./workflow.js";

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
  /**
   * @returns true when the execution name with the same input
   *          was already started. Use `getExecution` to check the status.
   */
  alreadyRunning: boolean;
}

export interface PublishEventsRequest {
  events: EventEnvelope<any>[];
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

export interface ListWorkflowsResponse {
  workflows: WorkflowReference[];
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

export function isFailedExecutionRequest(
  executionRequest: SucceedExecutionRequest | FailExecutionRequest
): executionRequest is FailExecutionRequest {
  return "error" in executionRequest;
}

export interface ListExecutionsRequest {
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

export interface ListExecutionsResponse {
  executions: Execution[];
  /**
   * A token returned when there may be more executions to retrieve.
   */
  nextToken?: string;
}

export interface ListExecutionEventsRequest {
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

export interface ListExecutionEventsResponse {
  events: WorkflowEvent[];
  nextToken?: string;
}

export enum ActivityUpdateType {
  Success = "Success",
  Failure = "Failure",
  Heartbeat = "Heartbeat",
}

export type SendActivityUpdate<T = any> =
  | SendActivitySuccessRequest<T>
  | SendActivityFailureRequest
  | SendActivityHeartbeatRequest;

export interface SendActivitySuccessRequest<T = any> {
  type: ActivityUpdateType.Success;
  activityToken: string;
  result: T;
}

export interface SendActivityFailureRequest {
  type: ActivityUpdateType.Failure;
  activityToken: string;
  error: string;
  message?: string;
}

export interface SendActivityHeartbeatRequest {
  type: ActivityUpdateType.Heartbeat;
  activityToken: string;
}

export function isSendActivitySuccessRequest<T = any>(
  request: SendActivityUpdate<T>
): request is SendActivitySuccessRequest<T> {
  return request.type === ActivityUpdateType.Success;
}

export function isSendActivityFailureRequest(
  request: SendActivityUpdate
): request is SendActivityFailureRequest {
  return request.type === ActivityUpdateType.Failure;
}

export function isSendActivityHeartbeatRequest(
  request: SendActivityUpdate
): request is SendActivityHeartbeatRequest {
  return request.type === ActivityUpdateType.Heartbeat;
}

export interface SendActivityHeartbeatResponse {
  /**
   * True when the activity has been cancelled.
   *
   * This is the only way for a long running activity to know it was cancelled.
   */
  cancelled: boolean;
}

export interface SendSignalRequest<Payload = any> {
  execution: ExecutionHandle<any> | string;
  signal: string | Signal<Payload>;
  payload?: Payload;
  /**
   * Execution scoped unique event id. Duplicates will be deduplicated.
   */
  id?: string;
}
