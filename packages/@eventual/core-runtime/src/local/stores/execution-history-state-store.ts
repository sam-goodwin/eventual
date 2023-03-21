import type { HistoryStateEvent } from "@eventual/core/internal";
import type {
  ExecutionHistoryStateStore,
  UpdateHistoryRequest,
} from "../../stores/execution-history-state-store.js";

export class LocalExecutionHistoryStateStore
  implements ExecutionHistoryStateStore
{
  private executionHistory: Record<string, HistoryStateEvent[]> = {};

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
