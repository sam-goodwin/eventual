import {
  ExecutionEventsRequest,
  ExecutionEventsResponse,
  ExecutionHistoryStore,
  SortOrder,
  WorkflowEvent,
} from "@eventual/core";

export class TestExecutionHistoryStore extends ExecutionHistoryStore {
  private eventStore: Record<string, WorkflowEvent[]> = {};

  public async putEvent<T extends WorkflowEvent>(
    executionId: string,
    event: T
  ): Promise<void> {
    this.putEvents(executionId, [event]);
  }

  public async putEvents(
    executionId: string,
    events: WorkflowEvent[]
  ): Promise<void> {
    (this.eventStore[executionId] ??= []).push(...events);
  }

  public async getEvents(
    request: ExecutionEventsRequest
  ): Promise<ExecutionEventsResponse> {
    const sortedEvents = (this.eventStore[request.executionId] ?? []).sort(
      (a, b) =>
        request.sortDirection === SortOrder.Asc
          ? new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          : new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return { events: sortedEvents };
  }
}
