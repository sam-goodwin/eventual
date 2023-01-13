import {
  ActivityRuntimeClient,
  computeScheduleDate,
  createEvent,
  Execution,
  ExecutionStatus,
  formatExecutionId,
  GetExecutionsRequest,
  GetExecutionsResponse,
  HistoryStateEvent,
  StartChildExecutionRequest,
  StartExecutionRequest,
  StartExecutionResponse,
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

  public async startExecution<W extends Workflow = Workflow>(
    request: StartChildExecutionRequest<W> | StartExecutionRequest<W>
  ): Promise<StartExecutionResponse> {
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
        "parentExecutionId" in request
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
          context: {
            name,
            parentId:
              "parentExecutionId" in request
                ? request.parentExecutionId
                : undefined,
          },
          workflowName,
          input: request.input,
          timeoutTime: request.timeout
            ? computeScheduleDate(request.timeout, baseTime).toISOString()
            : undefined,
        },
        baseTime
      )
    );

    return { executionId };
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
