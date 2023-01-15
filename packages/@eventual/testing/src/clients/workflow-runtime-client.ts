import {
  ActivityWorker,
  ActivityWorkerRequest,
  SucceededExecution,
  SucceedExecutionRequest,
  ExecutionStatus,
  FailedExecution,
  FailExecutionRequest,
  HistoryStateEvent,
  UpdateHistoryRequest,
  WorkflowClient,
  WorkflowRuntimeClient,
} from "@eventual/core";
import { TimeConnector } from "../environment.js";
import { ExecutionStore } from "../execution-store.js";

export class TestWorkflowRuntimeClient extends WorkflowRuntimeClient {
  private executionHistory: Record<string, HistoryStateEvent[]> = {};

  constructor(
    private executionStore: ExecutionStore,
    private timeConnector: TimeConnector,
    workflowClient: WorkflowClient,
    private activityWorker: ActivityWorker
  ) {
    super(workflowClient);
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

  protected async updateExecution(
    request: FailExecutionRequest | SucceedExecutionRequest
  ) {
    const execution = this.executionStore.get(request.executionId);

    if (!execution) {
      throw new Error(
        `Execution ${request.executionId} is missing from the store.`
      );
    } else if (execution.status !== ExecutionStatus.IN_PROGRESS) {
      // mirror how the AWS complete function does not write over completed executions.
      return execution;
    }

    const endTime = this.timeConnector.getTime().toISOString();

    const updatedExecution =
      "error" in request
        ? ({
            ...execution,
            endTime,
            status: ExecutionStatus.FAILED,
            error: request.error,
            message: request.message,
          } satisfies FailedExecution)
        : ({
            ...execution,
            endTime,
            status: ExecutionStatus.SUCCEEDED,
            result: request.result,
          } satisfies SucceededExecution);

    this.executionStore.put(updatedExecution);

    return updatedExecution;
  }

  public async startActivity(request: ActivityWorkerRequest): Promise<void> {
    return this.activityWorker(
      request,
      this.timeConnector.getTime(),
      // end time is the start time plus one second
      (start) => new Date(start.getTime() + 1000)
    );
  }
}
