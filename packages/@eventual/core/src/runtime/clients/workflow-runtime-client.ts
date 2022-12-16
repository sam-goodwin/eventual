import { HistoryStateEvent } from "../../workflow-events.js";
import { CompleteExecution, FailedExecution } from "../../execution.js";
import { ActivityWorkerRequest } from "../handlers/activity-worker.js";

export interface CompleteExecutionRequest {
  executionId: string;
  result?: any;
}

export interface FailExecutionRequest {
  executionId: string;
  error: string;
  message: string;
}

export interface UpdateHistoryRequest {
  executionId: string;
  events: HistoryStateEvent[];
}

export interface WorkflowRuntimeClient {
  getHistory(executionId: string): Promise<HistoryStateEvent[]>;

  // TODO: etag
  updateHistory(request: UpdateHistoryRequest): Promise<{ bytes: number }>;

  completeExecution(
    request: CompleteExecutionRequest
  ): Promise<CompleteExecution>;

  failExecution(request: FailExecutionRequest): Promise<FailedExecution>;

  startActivity(request: ActivityWorkerRequest): Promise<void>;
}
