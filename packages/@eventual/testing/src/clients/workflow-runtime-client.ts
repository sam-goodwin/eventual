import {
  ActivityCompleted,
  ActivityWorkerRequest,
  callableActivities,
  CompleteExecution,
  CompleteExecutionRequest,
  createEvent,
  ExecutionStatus,
  FailedExecution,
  FailExecutionRequest,
  HistoryStateEvent,
  UpdateHistoryRequest,
  WorkflowEventType,
  WorkflowRuntimeClient,
} from "@eventual/core";
import { TimeConnector } from "../environment.js";
import { ExecutionStore } from "../execution-store.js";

export class TestWorkflowRuntimeClient implements WorkflowRuntimeClient {
  private executionHistory: Record<string, HistoryStateEvent[]> = {};

  constructor(
    private executionStore: ExecutionStore,
    private timeConnector: TimeConnector
  ) {}

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
    const execution: CompleteExecution = {
      id: request.executionId,
      endTime: new Date(0).toISOString(),
      startTime: new Date(0).toISOString(),
      status: ExecutionStatus.COMPLETE,
      result: request.result,
    };

    this.executionStore.put(execution);

    return execution;
  }

  async failExecution(request: FailExecutionRequest): Promise<FailedExecution> {
    const execution: FailedExecution = {
      id: request.executionId,
      endTime: new Date(0).toISOString(),
      startTime: new Date(0).toISOString(),
      status: ExecutionStatus.FAILED,
      error: request.error,
      message: request.message,
    };

    this.executionStore.put(execution);

    return execution;
  }

  async startActivity(_request: ActivityWorkerRequest): Promise<void> {
    const activity = callableActivities()[_request.command.name];
    if (!activity) {
      throw new Error("Activity not found " + _request.command.name);
    }
    // TODO: support mocks
    const result = await activity(..._request.command.args);
    this.timeConnector.pushEvent({
      executionId: _request.executionId,
      events: [
        createEvent<ActivityCompleted>(
          {
            type: WorkflowEventType.ActivityCompleted,
            result: result,
            seq: _request.command.seq,
          },
          this.timeConnector.time
        ),
      ],
    });
    return;
  }
}
