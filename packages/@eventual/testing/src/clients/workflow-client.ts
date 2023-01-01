import {
  ActivityRuntimeClient,
  createEvent,
  Execution,
  ExecutionStatus,
  formatExecutionId,
  GetExecutionsRequest,
  GetExecutionsResponse,
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
    private timeConnector: TimeConnector,
    activityRuntimeClient: ActivityRuntimeClient,
    private executionStore: ExecutionStore
  ) {
    super(activityRuntimeClient, () => timeConnector.getTime());
  }

  public async startWorkflow<W extends Workflow = Workflow>(
    request: StartWorkflowRequest<W>
  ): Promise<string> {
    const name = request.executionName ?? ulid();
    const workflowName =
      typeof request.workflow === "string"
        ? request.workflow
        : request.workflow.workflowName;
    const executionId = formatExecutionId(
      workflowName,
      request.executionName ?? ulid()
    );

    const baseTime = this.baseTime();

    const execution: Execution = {
      status: ExecutionStatus.IN_PROGRESS,
      id: executionId,
      startTime: baseTime.toISOString(),
      workflowName,
      parent:
        request.parentExecutionId !== undefined && request.seq !== undefined
          ? { executionId: request.parentExecutionId, seq: request.seq }
          : undefined,
    };

    // TODO validate that the executionId and name are unique
    // TODO move more of this logic to a common place
    this.executionStore.put(execution);

    await this.submitWorkflowTask(
      executionId,
      createEvent<WorkflowStarted>(
        {
          type: WorkflowEventType.WorkflowStarted,
          context: { name, parentId: request.parentExecutionId },
          workflowName,
          input: request.input,
          timeoutTime: request.timeoutSeconds
            ? new Date(
                baseTime.getTime() + request.timeoutSeconds * 1000
              ).toISOString()
            : undefined,
        },
        baseTime
      )
    );

    return executionId;
  }

  public async submitWorkflowTask(
    executionId: string,
    ...events: HistoryStateEvent[]
  ): Promise<void> {
    this.timeConnector.pushEvent({ executionId, events });
  }

  public async getExecutions(
    request: GetExecutionsRequest
  ): Promise<GetExecutionsResponse> {
    return this.executionStore.list(request);
  }

  public async getExecution(
    executionId: string
  ): Promise<Execution<any> | undefined> {
    return this.executionStore.get(executionId);
  }
}
