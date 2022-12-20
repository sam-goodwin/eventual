import {
  ActivityRuntimeClient,
  createEvent,
  Execution,
  ExecutionStatus,
  formatExecutionId,
  HistoryStateEvent,
  StartWorkflowRequest,
  Workflow,
  WorkflowClient,
  WorkflowEventType,
  WorkflowStarted,
} from "@eventual/core";
import { ExecutionStore } from "../execution-store.js";
import { ulid } from "ulidx";
import { TimeConnector } from "../environment.js";

export class TestWorkflowClient extends WorkflowClient {
  constructor(
    private time: TimeConnector,
    activityRuntimeClient: ActivityRuntimeClient,
    private executionStore: ExecutionStore
  ) {
    super(activityRuntimeClient);
  }

  public async startWorkflow<W extends Workflow<any, any> = Workflow<any, any>>(
    request: StartWorkflowRequest<W>
  ): Promise<string> {
    // TODO maintain a store of executions
    const name = request.executionName ?? ulid();
    const executionId = formatExecutionId(
      request.workflowName,
      request.executionName ?? ulid()
    );

    // TODO validate that the executionId and name are unique
    this.executionStore.put({
      status: ExecutionStatus.IN_PROGRESS,
      id: executionId,
      startTime: this.time.time.toISOString(),
    });

    await this.submitWorkflowTask(
      executionId,
      createEvent<WorkflowStarted>({
        type: WorkflowEventType.WorkflowStarted,
        context: { name, parentId: request.parentExecutionId },
        workflowName: request.workflowName,
        input: request.input,
        timeoutTime: request.timeoutSeconds
          ? new Date(
              this.time.time.getTime() + request.timeoutSeconds * 1000
            ).toISOString()
          : undefined,
      })
    );

    return executionId;
  }

  public async submitWorkflowTask(
    executionId: string,
    ...events: HistoryStateEvent[]
  ): Promise<void> {
    this.time.pushEvent({ executionId, events });
  }

  public async getExecutions(_props: {
    statuses?: ExecutionStatus[] | undefined;
    workflowName?: string | undefined;
  }): Promise<Execution<any>[]> {
    return this.executionStore.list();
  }

  public async getExecution(
    executionId: string
  ): Promise<Execution<any> | undefined> {
    return this.executionStore.get(executionId);
  }
}
