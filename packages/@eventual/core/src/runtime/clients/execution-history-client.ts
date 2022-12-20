import { createEvent, WorkflowEvent } from "../../workflow-events.js";

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

  public async createAndPutEvent<T extends WorkflowEvent>(
    executionId: string,
    event: UnresolvedEvent<T>,
    time?: Date
  ): Promise<T> {
    const resolvedEvent = createEvent(event, time);

    await this.putEvent(executionId, resolvedEvent);

    return resolvedEvent;
  }

  /**
   * Writes events as a batch into the history table, assigning IDs and timestamp first.
   */
  public async createAndPutEvents(
    executionId: string,
    events: UnresolvedEvent<WorkflowEvent>[],
    time?: Date
  ): Promise<WorkflowEvent[]> {
    const resolvedEvents = events.map((e) => createEvent(e, time));

    await this.putEvents(executionId, resolvedEvents);

    return resolvedEvents;
  }
}
