import type { HistoryStateEvent } from "@eventual/core/internal";
import type {
  ExecutionHistoryStateStore,
  UpdateHistoryRequest,
} from "../../stores/execution-history-state-store.js";
import type { LocalSerializable } from "../local-persistance-store.js";

export class LocalExecutionHistoryStateStore
  implements ExecutionHistoryStateStore, LocalSerializable
{
  constructor(
    private executionHistory: Record<string, HistoryStateEvent[]> = {}
  ) {}

  public serialize(): Record<string, Buffer> {
    return Object.fromEntries(
      Object.entries(this.executionHistory).map(([e, history]) => [
        e,
        Buffer.from(JSON.stringify(history)),
      ])
    );
  }

  public static fromSerializedData(data?: Record<string, Buffer>) {
    if (!data) {
      return new LocalExecutionHistoryStateStore();
    }
    return new LocalExecutionHistoryStateStore(
      Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key,
          JSON.parse(value.toString("utf-8")),
        ])
      )
    );
  }

  public async getHistory(executionId: string): Promise<HistoryStateEvent[]> {
    return this.executionHistory[executionId] ?? [];
  }

  public async updateHistory(
    request: UpdateHistoryRequest
  ): Promise<{ bytes: number }> {
    this.executionHistory[request.executionId] = request.events;
    return { bytes: 0 };
  }
}
