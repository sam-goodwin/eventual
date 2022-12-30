import { EventEnvelope } from "./event.js";
import { Execution, ExecutionStatus } from "./execution.js";
import {
  CompleteActivityRequest,
  FailActivityRequest,
  HeartbeatRequest,
  HeartbeatResponse,
  SendSignalRequest,
  StartWorkflowRequest,
} from "./runtime/clients/workflow-client.js";
import { WorkflowEvent } from "./workflow-events.js";
import { Workflow } from "./workflow.js";

/**
 * Top level Eventual Client used by systems outside of an Eventual Service to interact with it.
 */
export interface EventualServiceClient {
  /**
   * Start a workflow execution
   * @param name Suffix of execution id
   * @param input Workflow parameters
   */
  startExecution<W extends Workflow = Workflow>(
    request: StartWorkflowRequest<W>
  ): Promise<StartExecutionResponse>;

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
  getExecutionEvents(
    request: ExecutionEventsRequest
  ): Promise<ExecutionEventsResponse>;

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

export type SortOrder = "Asc" | "Desc";
