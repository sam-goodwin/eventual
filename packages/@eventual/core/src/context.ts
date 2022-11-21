/**
 * Context values related to the current execution of the workflow.
 */
export interface ExecutionContext {
  /**
   * Computed, Unique ID of the execution.
   */
  id: string;
  /**
   * Unique name of the execution, optionally provided in the startWorkflow call.
   */
  name: string;
  /**
   * The ISO 8601 UTC time the execution started.
   */
  startTime: string;
}

/**
 * Context values related to the workflow definition.
 */
export interface WorkflowContext {
  /**
   * The name of the workflow.
   */
  name: string;
}

/**
 * Context values provided to each workflow execution.
 */
export interface Context {
  /**
   * Context values related to the current execution of the workflow.
   */
  workflow: WorkflowContext;
  /**
   * Context values related to the workflow definition.
   */
  execution: ExecutionContext;
}
