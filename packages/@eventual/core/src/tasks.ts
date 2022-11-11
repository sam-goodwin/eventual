import { Event } from "./events.js";

/**
 * A task which delivers new {@link Event}s to a workflow execution.
 *
 * May cause the workflow execution to progress, generating more commands and events.
 */
export interface WorkflowTask {
  executionId: string;
  events: Event[];
}
