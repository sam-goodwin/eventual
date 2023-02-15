import {
  Execution,
  ExecutionStatus,
  FailedExecution,
  FailExecutionRequest,
  InProgressExecution,
  isFailedExecutionRequest,
  ListExecutionsRequest,
  ListExecutionsResponse,
  SortOrder,
  SucceededExecution,
  SucceedExecutionRequest,
  WorkflowStarted,
} from "@eventual/core";
import { ExecutionStore } from "@eventual/runtime-core";
import { TimeConnector } from "../environment.js";

export class TestExecutionStore implements ExecutionStore {
  private executionStore: Record<string, Execution<any>> = {};

  constructor(private timeConnector: TimeConnector) {}

  public async create(
    execution: InProgressExecution,
    startEvent?: WorkflowStarted
  ): Promise<void> {
    this.executionStore[execution.id] = execution;

    if (startEvent) {
      this.timeConnector.pushEvent({
        executionId: execution.id,
        events: [startEvent],
      });
    }
  }

  public async update<Result = any>(
    request: FailExecutionRequest | SucceedExecutionRequest<Result>
  ): Promise<FailedExecution | SucceededExecution<Result>> {
    const execution = await this.get(request.executionId);

    if (!execution) {
      throw new Error(`Execution ${request.executionId} does not exist.`);
    }

    const updated: FailedExecution | SucceededExecution =
      isFailedExecutionRequest(request)
        ? {
            ...execution,
            endTime: request.endTime,
            error: request.error,
            message: request.message,
            status: ExecutionStatus.FAILED,
          }
        : {
            ...execution,
            endTime: request.endTime,
            result: request.result,
            status: ExecutionStatus.SUCCEEDED,
          };

    this.executionStore[execution.id] = updated;

    return updated;
  }

  public async get<Result = any>(
    executionId: string
  ): Promise<Execution<Result> | undefined> {
    return this.executionStore[executionId];
  }

  public async list(
    request: ListExecutionsRequest
  ): Promise<ListExecutionsResponse> {
    const executions = Object.values(this.executionStore).sort((a, b) =>
      request.sortDirection === SortOrder.Asc
        ? new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        : new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

    const filteredExecutions = executions.filter(
      (e) =>
        (!request.statuses || e.status in request.statuses) &&
        (!request.workflowName || request.workflowName === e.workflowName)
    );

    return {
      executions: filteredExecutions,
    };
  }
}
