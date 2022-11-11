import { WorkflowEvent } from "./events";

/**
 * A task which delivers new {@link WorkflowEvent}s to a workflow execution.
 *
 * May cause the workflow execution to progress, generating more commands and events.
 */
export interface WorkflowTask {
  executionId: string;
  events: WorkflowEvent[];
}
