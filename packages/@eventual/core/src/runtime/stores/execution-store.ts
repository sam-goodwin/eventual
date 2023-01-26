import {
  Execution,
  ExecutionStatus,
  FailedExecution,
  InProgressExecution,
  SucceededExecution,
} from "../../execution.js";
import { SortOrder } from "../../service-client.js";

/**
 * Store which maintains the data for each {@link Execution}.
 */
export interface ExecutionStore {
  /**
   * Creates a new execution record, failing if the execution already exist.
   *
   * If the execution already exists, throws {@link ExecutionAlreadyExists}.
   *
   * Note: This methods does not do other things needed to start a workflow.
   *       For example, sending the {@link workflowStartedEvent}.
   *       It only creates the database record.
   * @see EventualServiceClient.startExecution
   */
  create(execution: InProgressExecution): Promise<void>;

  /**
   * Updates an execution to the failed or succeeded state.
   *
   * Note: this method does not do other things needed to complete a workflow.
   *       For example, updating the parent workflow of the change.
   *       It only updates the database record.
   * @see WorkflowRuntimeClient.succeedExecution
   */
  update<Result = any>(
    request: FailExecutionRequest | SucceedExecutionRequest<Result>
  ): Promise<SucceededExecution<Result> | FailedExecution>;

  /**
   * Get a single execution.
   */
  get<Result = any>(
    executionId: string
  ): Promise<Execution<Result> | undefined>;

  /**
   * List all executions with pagination.
   */
  list(request: ListExecutionsRequest): Promise<ListExecutionsResponse>;
}

export interface SucceedExecutionRequest<Result = any> {
  executionId: string;
  result?: Result;
}

export interface FailExecutionRequest {
  executionId: string;
  error: string;
  message: string;
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
