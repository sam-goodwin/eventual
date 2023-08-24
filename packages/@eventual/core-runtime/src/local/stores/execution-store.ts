import {
  Execution,
  ExecutionStatus,
  FailedExecution,
  FailExecutionRequest,
  InProgressExecution,
  ListExecutionsRequest,
  ListExecutionsResponse,
  SucceededExecution,
  SucceedExecutionRequest,
} from "@eventual/core";
import {
  isFailedExecutionRequest,
  WorkflowStarted,
} from "@eventual/core/internal";
import type { ExecutionStore } from "../../stores/execution-store.js";
import type { LocalEnvConnector } from "../local-container.js";
import { LocalSerializable } from "../local-persistance-store.js";

export class LocalExecutionStore implements ExecutionStore, LocalSerializable {
  constructor(
    private localConnector: LocalEnvConnector,
    private executionStore: Record<string, Execution<any>> = {}
  ) {}

  public static fromSerializedData(
    localConnector: LocalEnvConnector,
    data: Record<string, Buffer>
  ) {
    return new LocalExecutionStore(
      localConnector,
      JSON.parse(data.data!.toString("utf-8"))
    );
  }

  public serialize(): Record<string, Buffer> {
    return {
      data: Buffer.from(JSON.stringify(this.executionStore)),
    };
  }

  public async create(
    execution: InProgressExecution,
    startEvent?: WorkflowStarted
  ): Promise<void> {
    this.executionStore[execution.id] = execution;

    if (startEvent) {
      this.localConnector.pushWorkflowTaskNextTick({
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
      request.sortDirection === "ASC"
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
