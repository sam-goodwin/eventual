import {
  ActivityCompleted,
  ActivityFailed,
  createEvent,
  HistoryStateEvent,
  SignalReceived,
  WorkflowEventType,
} from "../../events.js";
import { Execution, ExecutionStatus } from "../../execution.js";
import { Signal } from "../../signals.js";
import { Workflow, WorkflowInput, WorkflowOptions } from "../../workflow.js";
import { decodeActivityToken } from "../activity-token.js";
import { ActivityRuntimeClient } from "./activity-runtime-client.js";

export abstract class WorkflowClient {
  constructor(private activityRuntimeClient: ActivityRuntimeClient) {}
  /**
   * Start a workflow execution
   * @param name Suffix of execution id
   * @param input Workflow parameters
   * @returns
   */
  public abstract startWorkflow<W extends Workflow = Workflow>(
    request: StartWorkflowRequest<W>
  ): Promise<string>;
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

  public abstract getExecutions(props: {
    statuses?: ExecutionStatus[];
    workflowName?: string;
  }): Promise<Execution[]>;

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
    await this.submitWorkflowTask(
      request.executionId,
      createEvent<SignalReceived>(
        {
          type: WorkflowEventType.SignalReceived,
          payload: request.payload,
          signalId:
            typeof request.signal === "string"
              ? request.signal
              : request.signal.id,
        },
        undefined,
        request.id
      )
    );
  }

  /**
   * Completes an async activity causing it to return the given value.
   */
  public async completeActivity({
    activityToken,
    result,
  }: CompleteActivityRequest): Promise<void> {
    await this.sendActivityResult<ActivityCompleted>(activityToken, {
      type: WorkflowEventType.ActivityCompleted,
      result,
    });
  }

  /**
   * Fails an async activity causing it to throw the given error.
   */
  public async failActivity({
    activityToken,
    error,
    message,
  }: FailActivityRequest): Promise<void> {
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
  public async heartbeatActivity(
    request: HeartbeatRequest
  ): Promise<HeartbeatResponse> {
    const data = decodeActivityToken(request.activityToken);

    const execution = await this.getExecution(data.payload.executionId);

    if (execution?.status !== ExecutionStatus.IN_PROGRESS) {
      return { cancelled: true };
    }

    return await this.activityRuntimeClient.heartbeatActivity(
      data.payload.executionId,
      data.payload.seq,
      new Date().toISOString()
    );
  }

  private async sendActivityResult<
    E extends ActivityCompleted | ActivityFailed
  >(activityToken: string, event: Omit<E, "seq" | "duration" | "timestamp">) {
    const data = decodeActivityToken(activityToken);
    await this.submitWorkflowTask(
      data.payload.executionId,
      createEvent<ActivityCompleted | ActivityFailed>({
        ...event,
        seq: data.payload.seq,
      })
    );
  }
}

export interface SendSignalRequest {
  executionId: string;
  signal: string | Signal;
  payload?: any;
  /**
   * Execution scoped unique event id. Duplicates will be deduplicated.
   */
  id: string;
}

export interface StartWorkflowRequest<W extends Workflow = Workflow>
  extends WorkflowOptions {
  /**
   * Name of the workflow execution.
   *
   * Only one workflow can exist for an ID. Requests to start a workflow
   * with the name of an existing workflow will fail.
   *
   * @default - a unique name is generated.
   */
  executionName?: string;
  /**
   * Name of the workflow to execute.
   */
  workflowName: string;
  /**
   * Input payload for the workflow function.
   */
  input?: WorkflowInput<W>;
  /**
   * ID of the parent execution if this is a child workflow
   */
  parentExecutionId?: string;
  /**
   * Sequence ID of this execution if this is a child workflow
   */
  seq?: number;
}

export interface StartWorkflowResponse {
  /**
   * ID of the started workflow execution.
   */
  executionId: string;
}

export interface CompleteActivityRequest {
  activityToken: string;
  result: any;
}

export interface FailActivityRequest {
  activityToken: string;
  error: string;
  message: string;
}

export interface HeartbeatRequest {
  activityToken: string;
}

export interface HeartbeatResponse {
  /**
   * True when the activity has been cancelled.
   *
   * This is the only way for a long running activity to know it was canelled.
   */
  cancelled: boolean;
}
