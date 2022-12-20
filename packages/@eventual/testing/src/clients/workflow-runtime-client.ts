import {
  ActivityWorkerRequest,
  CompleteExecution,
  CompleteExecutionRequest,
  ExecutionStatus,
  FailedExecution,
  FailExecutionRequest,
  HistoryStateEvent,
  UpdateHistoryRequest,
  WorkflowRuntimeClient,
} from "@eventual/core";

export class TestWorkflowRuntimeClient implements WorkflowRuntimeClient {
  private executionHistory: Record<string, HistoryStateEvent[]> = {};

  async getHistory(executionId: string): Promise<HistoryStateEvent[]> {
    return this.executionHistory[executionId] ?? [];
  }
  async updateHistory(
    request: UpdateHistoryRequest
  ): Promise<{ bytes: number }> {
    this.executionHistory[request.executionId] = request.events;
    return { bytes: 0 };
  }
  async completeExecution(
    request: CompleteExecutionRequest
  ): Promise<CompleteExecution<any>> {
    // just respond to make the caller happy, no persistence for  now
    return {
      id: request.executionId,
      endTime: new Date(0).toISOString(),
      startTime: new Date(0).toISOString(),
      status: ExecutionStatus.COMPLETE,
      result: request.result,
    };
  }
  async failExecution(request: FailExecutionRequest): Promise<FailedExecution> {
    // just respond to make the caller happy, no persistence for  now
    return {
      id: request.executionId,
      endTime: new Date(0).toISOString(),
      startTime: new Date(0).toISOString(),
      status: ExecutionStatus.FAILED,
      error: request.error,
      message: request.message,
    };
  }
  async startActivity(_request: ActivityWorkerRequest): Promise<void> {
    // do nothing for now
    return;
  }
}
