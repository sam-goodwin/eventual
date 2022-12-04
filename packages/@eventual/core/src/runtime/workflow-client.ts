import { HistoryStateEvent } from "../events.js";
import { Execution, ExecutionStatus } from "../execution.js";
import { Signal } from "../signals.js";
import { Workflow, WorkflowInput } from "../workflow.js";

export interface WorkflowClient {
  /**
   * Start a workflow execution
   * @param name Suffix of execution id
   * @param input Workflow parameters
   * @returns
   */
  startWorkflow<W extends Workflow = Workflow>(
    request: StartWorkflowRequest<W>
  ): Promise<string>;
  /**
   * Submit events to be processed by a workflow's orchestrator.
   *
   * @param executionId ID of the workflow execution
   * @param events events to submit for processing
   */
  submitWorkflowTask(
    executionId: string,
    ...events: HistoryStateEvent[]
  ): Promise<void>;

  getExecutions(props: {
    statuses?: ExecutionStatus[];
    workflowName?: string;
  }): Promise<Execution[]>;

  getExecution(executionId: string): Promise<Execution | undefined>;

  sendSignal(request: SendSignalRequest): Promise<void>;
}

export interface SendSignalRequest {
  executionId: string;
  signal: string | Signal;
  payload?: any;
  /**
   * Execution scoped unique event id. Duplicates will be deduplicated.
   */
  id: string;
}

export interface StartWorkflowRequest<W extends Workflow = Workflow> {
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
  input?: WorkflowInput<W>;
  /**
   * ID of the parent execution if this is a child workflow
   */
  parentExecutionId?: string;
  /**
   * Sequence ID of this execution if this is a child workflow
   */
  seq?: number;
}

export interface StartWorkflowResponse {
  /**
   * ID of the started workflow execution.
   */
  executionId: string;
}
