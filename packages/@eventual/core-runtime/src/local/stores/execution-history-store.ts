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
    console.log(request);
    const tokenPayload = request.nextToken
      ? deserializeToken(request.nextToken)
      : undefined;
    const afterDate = request.after
      ? new Date(request.after).getTime()
      : undefined;
    const sortedEvents = (this.eventStore[request.executionId] ?? []).sort(
      (a, b) =>
        request.sortDirection === "DESC"
          ? new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          : new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const dateFiltered = afterDate
      ? sortedEvents.filter(
          (event) => new Date(event.timestamp).getTime() > afterDate
        )
      : sortedEvents;
    const start = tokenPayload?.index ?? 0;
    const rangeEvents = dateFiltered.slice(
      start,
      request.maxResults ? start + request.maxResults : undefined
    );

    const res = {
      events: rangeEvents,
      nextToken:
        start + rangeEvents.length < dateFiltered.length
          ? serializeToken({ index: start + rangeEvents.length })
          : undefined,
    };
    console.log(res);
    return res;
  }
}

interface TokenPayload {
  index: number;
}

function serializeToken(payload: TokenPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function deserializeToken(token: string): TokenPayload {
  return JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
}
