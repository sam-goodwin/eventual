import { HistoryStateEvent } from "@eventual/core/internal";

/**
 * A store which contains history events that are needed to replay
 * the execution.
 *
 * Unlike the {@link ExecutionHistoryStore}, the {@link ExecutionHistoryStateStore} must contain
 * all data needed to replay an execution (all {@link HistoryStateEvent}s) as well as full detailed
 * input and output data.
 *
 * In the AWS runtime, this is a S3 bucket (currently).
 */
export interface ExecutionHistoryStateStore {
  /**
   * Retrieve the {@link HistoryStateEvent}s for an execution.
   */
  getHistory(executionId: string): Promise<HistoryStateEvent[]>;
  /**
   * Updates the {@link HistoryStateEvent}s for an execution.
   *
   * Should expect ALL events for an execution and not just changed values.
   *
   * @returns number of bytes written for logging purposes.
   */
  updateHistory(request: UpdateHistoryRequest): Promise<{ bytes: number }>;
}

export interface UpdateHistoryRequest {
  executionId: string;
  events: HistoryStateEvent[];
}
