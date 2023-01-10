import {
  Execution,
  GetExecutionsRequest,
  GetExecutionsResponse,
  SortOrder,
} from "@eventual/core";

export class ExecutionStore {
  private executionStore: Record<string, Execution<any>> = {};

  public put(execution: Execution<any>) {
    this.executionStore[execution.id] = execution;
  }

  public get(executionId: string): Execution<any> | undefined {
    return this.executionStore[executionId];
  }

  public list(request: GetExecutionsRequest): GetExecutionsResponse {
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
