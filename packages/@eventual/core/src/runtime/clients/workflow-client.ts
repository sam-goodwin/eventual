import {
  ActivitySucceeded,
  ActivityFailed,
  createEvent,
  HistoryStateEvent,
  SignalReceived,
  WorkflowEventType,
} from "../../workflow-events.js";
import {
  Execution,
  ExecutionHandle,
  ExecutionStatus,
} from "../../execution.js";
import { Signal } from "../../signals.js";
import { Workflow, WorkflowOptions } from "../../workflow.js";
import { decodeActivityToken } from "../activity-token.js";
import { ActivityRuntimeClient } from "./activity-runtime-client.js";
import {
  SendActivitySuccessRequest,
  SendActivityFailureRequest,
  GetExecutionsRequest,
  GetExecutionsResponse,
  SendActivityHeartbeatRequest,
  StartExecutionRequest,
  SendActivityHeartbeatResponse,
  StartExecutionResponse,
} from "../../service-client.js";

export abstract class WorkflowClient {
  constructor(
    private activityRuntimeClient: ActivityRuntimeClient,
    protected baseTime: () => Date
  ) {}

  /**
   * Start a workflow execution
   * @param name Suffix of execution id
   * @param input Workflow parameters
   * @returns
   */
  public abstract startExecution<W extends Workflow = Workflow>(
    request: StartChildExecutionRequest<W> | StartExecutionRequest<W>
  ): Promise<StartExecutionResponse>;

  /**
   * Submit events to be processed by a workflow's orchestrator.
   *
   * @param executionId ID of the workflow execution
   * @param events events to submit for processing
   */
  public abstract submitWorkflowTask(
    executionId: string,
    ...events: HistoryStateEvent[]
  ): Promise<void>;

  public abstract getExecutions(
    props: GetExecutionsRequest
  ): Promise<GetExecutionsResponse>;

  public abstract getExecution(
    executionId: string
  ): Promise<Execution | undefined>;

  /**
   * Sends a signal to the given execution.
   *
   * The execution may be waiting on a signal or may have a handler registered
   * that runs when the signal is received.
   */
  public async sendSignal(request: SendSignalRequest): Promise<void> {
    const executionId =
      typeof request.execution === "string"
        ? request.execution
        : request.execution.executionId;
    await this.submitWorkflowTask(
      executionId,
      createEvent<SignalReceived>(
        {
          type: WorkflowEventType.SignalReceived,
          payload: request.payload,
          signalId:
            typeof request.signal === "string"
              ? request.signal
              : request.signal.id,
        },
        this.baseTime(),
        request.id
      )
    );
  }

  /**
   * Succeeds an async activity causing it to return the given value.
   */
  public async sendActivitySuccess({
    activityToken,
    result,
  }: Omit<SendActivitySuccessRequest, "type">): Promise<void> {
    await this.sendActivityResult<ActivitySucceeded>(activityToken, {
      type: WorkflowEventType.ActivitySucceeded,
      result,
    });
  }

  /**
   * Fails an async activity causing it to throw the given error.
   */
  public async sendActivityFailure({
    activityToken,
    error,
    message,
  }: Omit<SendActivityFailureRequest, "type">): Promise<void> {
    await this.sendActivityResult<ActivityFailed>(activityToken, {
      type: WorkflowEventType.ActivityFailed,
      error,
      message,
    });
  }

  /**
   * Submits a "heartbeat" for the given activityToken.
   *
   * @returns whether the activity has been cancelled by the calling workflow.
   */
  public async sendActivityHeartbeat(
    request: Omit<SendActivityHeartbeatRequest, "type">
  ): Promise<SendActivityHeartbeatResponse> {
    const data = decodeActivityToken(request.activityToken);

    const execution = await this.getExecution(data.payload.executionId);

    if (execution?.status !== ExecutionStatus.IN_PROGRESS) {
      return { cancelled: true };
    }

    return await this.activityRuntimeClient.heartbeatActivity(
      data.payload.executionId,
      data.payload.seq,
      this.baseTime().toISOString()
    );
  }

  private async sendActivityResult<
    E extends ActivitySucceeded | ActivityFailed
  >(activityToken: string, event: Omit<E, "seq" | "duration" | "timestamp">) {
    const data = decodeActivityToken(activityToken);
    await this.submitWorkflowTask(
      data.payload.executionId,
      createEvent<ActivitySucceeded | ActivityFailed>(
        {
          ...event,
          seq: data.payload.seq,
        },
        this.baseTime()
      )
    );
  }
}

export interface SendSignalRequest<Payload = any> {
  execution: ExecutionHandle<any> | string;
  signal: string | Signal<Payload>;
  payload?: Payload;
  /**
   * Execution scoped unique event id. Duplicates will be deduplicated.
   */
  id?: string;
}

export interface StartChildExecutionRequest<W extends Workflow = Workflow>
  extends StartExecutionRequest<W>,
    WorkflowOptions {
  parentExecutionId: string;
  /**
   * Sequence ID of this execution if this is a child workflow
   */
  seq: number;
}
