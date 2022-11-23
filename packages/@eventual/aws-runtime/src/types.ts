export interface StartWorkflowRequest {
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
  workflowName: string;
  /**
   * Input payload for the workflow function.
   */
  input?: any;
  /**
   * ID of the parent execution if this is a child workflow
   */
  parentExecutionId?: string;
  /**
   * Sequence ID of this execution if this is a child workflow
   */
  seq?: number;
}
