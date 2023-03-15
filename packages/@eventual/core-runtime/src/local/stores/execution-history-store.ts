import type {
  ExecutionID,
  ListExecutionEventsRequest,
  ListExecutionEventsResponse,
} from "@eventual/core";
import type { WorkflowEvent } from "@eventual/core/internal";
import { ExecutionHistoryStore } from "../../stores/execution-history-store.js";

export class TestExecutionHistoryStore extends ExecutionHistoryStore {
  private eventStore: Record<string, WorkflowEvent[]> = {};

  public async putEvents(
    executionId: ExecutionID,
    events: WorkflowEvent[]
  ): Promise<void> {
    (this.eventStore[executionId] ??= []).push(...events);
  }

  public async getEvents(
    request: ListExecutionEventsRequest
  ): Promise<ListExecutionEventsResponse> {
    const sortedEvents = (this.eventStore[request.executionId] ?? []).sort(
      (a, b) =>
        request.sortDirection === "ASC"
          ? new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          : new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return { events: sortedEvents };
  }
}
