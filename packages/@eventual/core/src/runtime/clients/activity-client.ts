import { ExecutionStatus } from "../../execution.js";
import {
  ActivitySucceeded,
  WorkflowEventType,
  ActivityFailed,
  createEvent,
} from "../../workflow-events.js";
import { decodeActivityToken } from "../activity-token.js";
import { ActivityWorkerRequest } from "../handlers/activity-worker.js";
import { ExecutionQueueClient, ExecutionStore } from "../index.js";
import { ActivityStore } from "../stores/activity-store.js";

export interface ActivityClientProps {
  activityStore: ActivityStore;
  executionStore: ExecutionStore;
  executionQueueClient: ExecutionQueueClient;
  baseTime?: () => Date;
}

export abstract class ActivityClient {
  private baseTime: () => Date;
  constructor(private props: ActivityClientProps) {
    this.baseTime = props.baseTime ?? (() => new Date());
  }

  public async sendHeartbeat(
    request: Omit<SendActivityHeartbeatRequest, "type">
  ): Promise<{ cancelled: boolean }> {
    const data = decodeActivityToken(request.activityToken);

    const execution = await this.props.executionStore.get(
      data.payload.executionId
    );

    if (execution?.status !== ExecutionStatus.IN_PROGRESS) {
      return { cancelled: true };
    }

    return this.props.activityStore.heartbeat(
      data.payload.executionId,
      data.payload.seq,
      this.baseTime().toISOString()
    );
  }

  /**
   * Succeeds an async activity causing it to return the given value.
   */
  public async sendSuccess({
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
  public async sendFailure({
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

  private async sendActivityResult<
    E extends ActivitySucceeded | ActivityFailed
  >(activityToken: string, event: Omit<E, "seq" | "duration" | "timestamp">) {
    const data = decodeActivityToken(activityToken);
    await this.props.executionQueueClient.submitExecutionEvents(
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

  public abstract startActivity(request: ActivityWorkerRequest): Promise<void>;
}

export enum ActivityUpdateType {
  Success = "Success",
  Failure = "Failure",
  Heartbeat = "Heartbeat",
}

export type SendActivityUpdate<T = any> =
  | SendActivitySuccessRequest<T>
  | SendActivityFailureRequest
  | SendActivityHeartbeatRequest;

export interface SendActivitySuccessRequest<T = any> {
  type: ActivityUpdateType.Success;
  activityToken: string;
  result: T;
}

export interface SendActivityFailureRequest {
  type: ActivityUpdateType.Failure;
  activityToken: string;
  error: string;
  message?: string;
}

export interface SendActivityHeartbeatRequest {
  type: ActivityUpdateType.Heartbeat;
  activityToken: string;
}

export function isSendActivitySuccessRequest<T = any>(
  request: SendActivityUpdate<T>
): request is SendActivitySuccessRequest<T> {
  return request.type === ActivityUpdateType.Success;
}

export function isSendActivityFailureRequest(
  request: SendActivityUpdate
): request is SendActivityFailureRequest {
  return request.type === ActivityUpdateType.Failure;
}

export function isSendActivityHeartbeatRequest(
  request: SendActivityUpdate
): request is SendActivityHeartbeatRequest {
  return request.type === ActivityUpdateType.Heartbeat;
}

export type SendActivityUpdateResponse = SendActivityHeartbeatResponse | void;

export interface SendActivityHeartbeatResponse {
  /**
   * True when the activity has been cancelled.
   *
   * This is the only way for a long running activity to know it was cancelled.
   */
  cancelled: boolean;
}
