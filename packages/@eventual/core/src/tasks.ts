import { HistoryStateEvent, WorkflowEvent } from "./events.js";

/**
 * A task which delivers new {@link WorkflowEvent}s to a workflow execution.
 *
 * May cause the workflow execution to progress, generating more commands and events.
 */
export interface WorkflowTask {
  executionId: string;
  id: string;
  events: HistoryStateEvent[];
}
