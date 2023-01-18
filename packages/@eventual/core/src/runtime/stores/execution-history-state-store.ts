import { HistoryStateEvent } from "../../workflow-events.js";

/**
 * A store which contains history events that are needed to replay
 * the execution.
 */
export interface ExecutionHistoryStateStore {
  getHistory(executionId: string): Promise<HistoryStateEvent[]>;

  updateHistory(request: UpdateHistoryRequest): Promise<{ bytes: number }>;
}

export interface UpdateHistoryRequest {
  executionId: string;
  events: HistoryStateEvent[];
}
