import { WorkflowEvent } from "../../workflow-events.js";

export type UnresolvedEvent<T extends WorkflowEvent> = Omit<
  T,
  "id" | "timestamp"
>;

export abstract class ExecutionHistoryClient {
  abstract putEvent<T extends WorkflowEvent>(
    executionId: string,
    event: T
  ): Promise<void>;

  /**
   * Writes events as a batch into the execution history table.
   */
  abstract putEvents(
    executionId: string,
    events: WorkflowEvent[]
  ): Promise<void>;

  /**
   * Read an execution's events from the execution history table table
   */
  abstract getEvents(executionId: string): Promise<WorkflowEvent[]>;
}
