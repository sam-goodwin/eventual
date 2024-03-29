import {
  Execution,
  FailedExecution,
  FailExecutionRequest,
  InProgressExecution,
  ListExecutionsRequest,
  ListExecutionsResponse,
  SucceededExecution,
  SucceedExecutionRequest,
} from "@eventual/core";
import { WorkflowStarted } from "@eventual/core/internal";

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
   *
   * @param startEvent - when provided, the system will emit a start event when the record is
   *                     successfully saved
   */
  create(
    execution: InProgressExecution,
    startEvent?: WorkflowStarted
  ): Promise<void>;

  /**
   * Updates an execution to the failed or succeeded state.
   *
   * Note: this method does not do other things needed to complete a workflow.
   *       For example, updating the parent workflow of the change.
   *       It only updates the database record.
   * @see WorkflowRuntimeClient.succeedExecution
   *
   * @param updateEvent - when provided the event will be transactionally emitted
   *                      on workflow update.
   */
  update<Result = any>(
    request: SucceedExecutionRequest<Result> | FailExecutionRequest
  ): Promise<FailedExecution | SucceededExecution<Result>>;

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
