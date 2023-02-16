import { HistoryStateEvent, WorkflowEvent } from "@eventual/core/internal";

/**
 * A task which delivers new {@link WorkflowEvent}s to a workflow execution.
 *
 * May cause the workflow execution to progress, generating more commands and events.
 */
export interface WorkflowTask {
  executionId: string;
  // accepts events as an object or a stringified HistoryStateEvent.
  events: (HistoryStateEvent | string)[];
}

export function isWorkflowTask(obj: any): obj is WorkflowTask {
  return "events" in obj && "executionId" in obj;
}
