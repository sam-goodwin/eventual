import { HistoryStateEvent, WorkflowEvent } from "./workflow-events.js";

/**
 * A task which delivers new {@link WorkflowEvent}s to a workflow execution.
 *
 * May cause the workflow execution to progress, generating more commands and events.
 */
export interface WorkflowTask {
  executionId: string;
  // accepts events as an object or a stringified HistoryStateEvent.
  events: (HistoryStateEvent | string)[];
  /**
   * Fields to inject into each of the events in the Task.
   *
   * Useful when the producer of the task must decouple the static and dynamic
   * data in the event like creating a partial event from a dynamo stream.
   *
   * Formats
   *    JSON_STRING - the value is a valid json string, the system should parse it into valid json.
   *    LITERAL - inject the value as is.
   */
  injectedFields?: Record<
    string,
    {
      format: "JSON_STRING" | "LITERAL";
      value: string;
    }
  >;
}

export function isWorkflowTask(obj: any): obj is WorkflowTask {
  return "events" in obj && "executionId" in obj;
}
