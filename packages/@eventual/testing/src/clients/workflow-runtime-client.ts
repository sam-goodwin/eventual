import {
  ActivityCompleted,
  ActivityFailed,
  ActivityWorkerRequest,
  CompleteExecution,
  CompleteExecutionRequest,
  createEvent,
  ExecutionStatus,
  extendsError,
  FailedExecution,
  FailExecutionRequest,
  HistoryStateEvent,
  isAsyncResult,
  UpdateHistoryRequest,
  WorkflowClient,
  WorkflowEventType,
  WorkflowRuntimeClient,
} from "@eventual/core";
import { ActivitiesController } from "../activities-controller.js";
import { TimeConnector } from "../environment.js";
import { ExecutionStore } from "../execution-store.js";

export class TestWorkflowRuntimeClient extends WorkflowRuntimeClient {
  private executionHistory: Record<string, HistoryStateEvent[]> = {};

  constructor(
    private executionStore: ExecutionStore,
    private timeConnector: TimeConnector,
    private activitiesController: ActivitiesController,
    workflowClient: WorkflowClient
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
    request: FailExecutionRequest | CompleteExecutionRequest
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
            status: ExecutionStatus.COMPLETE,
            result: request.result,
          } satisfies CompleteExecution);

    this.executionStore.put(updatedExecution);

    return updatedExecution;
  }

  public async startActivity(request: ActivityWorkerRequest): Promise<void> {
    try {
      const result = await this.activitiesController.invokeActivity(
        request.command.name,
        ...request.command.args
      );

      // if it is an async result... do nothing
      if (!isAsyncResult(result)) {
        this.timeConnector.pushEvent({
          executionId: request.executionId,
          events: [
            createEvent<ActivityCompleted>(
              {
                type: WorkflowEventType.ActivityCompleted,
                result,
                seq: request.command.seq,
              },
              this.timeConnector.getTime()
            ),
          ],
        });
      }
    } catch (err) {
      this.timeConnector.pushEvent({
        executionId: request.executionId,
        events: [
          createEvent<ActivityFailed>(
            {
              type: WorkflowEventType.ActivityFailed,
              seq: request.command.seq,
              // TODO: this logic is duplicated between AWS runtime and here, centralize
              error: extendsError(err) ? err.name : "Error",
              message: extendsError(err) ? err.message : JSON.stringify(err),
            },
            this.timeConnector.getTime()
          ),
        ],
      });
    }
  }
}
