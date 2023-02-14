import {
  ListExecutionEventsRequest,
  ListExecutionEventsResponse,
  SortOrder,
  WorkflowEvent,
} from "@eventual/core";
import { ExecutionHistoryStore } from "@eventual/core-runtime";

export class TestExecutionHistoryStore extends ExecutionHistoryStore {
  private eventStore: Record<string, WorkflowEvent[]> = {};

  public async putEvents(
    executionId: string,
    events: WorkflowEvent[]
  ): Promise<void> {
    (this.eventStore[executionId] ??= []).push(...events);
  }

  public async getEvents(
    request: ListExecutionEventsRequest
  ): Promise<ListExecutionEventsResponse> {
    const sortedEvents = (this.eventStore[request.executionId] ?? []).sort(
      (a, b) =>
        request.sortDirection === SortOrder.Asc
          ? new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          : new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return { events: sortedEvents };
  }
}
