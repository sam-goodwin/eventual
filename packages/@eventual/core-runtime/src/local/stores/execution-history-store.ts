import type {
  ExecutionID,
  ListExecutionEventsRequest,
  ListExecutionEventsResponse,
} from "@eventual/core";
import type { WorkflowEvent } from "@eventual/core/internal";
import { ExecutionHistoryStore } from "../../stores/execution-history-store.js";
import { paginateItems } from "./pagination.js";

export class LocalExecutionHistoryStore extends ExecutionHistoryStore {
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
    const afterDate = request.after
      ? new Date(request.after).getTime()
      : undefined;
    const result = paginateItems(
      this.eventStore[request.executionId] ?? [],
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      afterDate
        ? (event) => new Date(event.timestamp).getTime() > afterDate
        : undefined,
      request.sortDirection,
      request.maxResults,
      request.nextToken
    );

    return {
      events: result.items,
      nextToken: result.nextToken,
    };
  }
}
