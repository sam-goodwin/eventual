import { WorkflowEvent } from "../../workflow-events.js";

export type UnresolvedEvent<T extends WorkflowEvent> = Omit<
  T,
  "id" | "timestamp"
>;

export interface ExecutionHistoryClient {
  createAndPutEvent<T extends WorkflowEvent>(
    executionId: string,
    event: UnresolvedEvent<T>,
    time?: Date
  ): Promise<T>;

  putEvent<T extends WorkflowEvent>(
    executionId: string,
    event: T
  ): Promise<void>;

  /**
   * Writes events as a batch into the history table, assigning IDs and timestamp first.
   */
  createAndPutEvents(
    executionId: string,
    events: UnresolvedEvent<WorkflowEvent>[],
    time?: Date
  ): Promise<WorkflowEvent[]>;

  /**
   * Writes events as a batch into the execution history table.
   */
  putEvents(executionId: string, events: WorkflowEvent[]): Promise<void>;

  /**
   * Read an execution's events from the execution history table table
   */
  getEvents(executionId: string): Promise<WorkflowEvent[]>;
}
