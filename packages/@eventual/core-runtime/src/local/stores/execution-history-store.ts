import type {
  ExecutionID,
  ListExecutionEventsRequest,
  ListExecutionEventsResponse,
} from "@eventual/core";
import type { WorkflowEvent } from "@eventual/core/internal";
import { ExecutionHistoryStore } from "../../stores/execution-history-store.js";
import type { LocalSerializable } from "../local-persistance-store.js";
import { paginateItems } from "./pagination.js";
import { fromJSON, toJSON } from "../serialize.js";

export class LocalExecutionHistoryStore
  extends ExecutionHistoryStore
  implements LocalSerializable
{
  constructor(private eventStore: Record<string, WorkflowEvent[]> = {}) {
    super();
  }

  public serialize(): Record<string, Buffer> {
    return Object.fromEntries(
      Object.entries(this.eventStore).map(([key, value]) => [
        key,
        Buffer.from(toJSON(value)),
      ])
    );
  }

  public static fromSerializedData(data?: Record<string, Buffer>) {
    return new LocalExecutionHistoryStore(
      data
        ? Object.fromEntries(
            Object.entries(data).map(([key, value]) => [
              key,
              fromJSON(value.toString("utf-8")),
            ])
          )
        : {}
    );
  }

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
      (a, b) => {
        const diff =
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        // if an event happens at the same time, use it's type.
        return diff === 0 ? a.type - b.type : diff;
      },
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
