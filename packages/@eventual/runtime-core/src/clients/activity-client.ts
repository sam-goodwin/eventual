import {
  ActivityFailed,
  ActivitySucceeded,
  ActivityWorkerRequest,
  createEvent,
  ExecutionStatus,
  SendActivityFailureRequest,
  SendActivityHeartbeatRequest,
  SendActivitySuccessRequest,
  WorkflowEventType,
} from "@eventual/core";
import { decodeActivityToken } from "../activity-token.js";
import { ActivityStore } from "../stores/activity-store.js";
import { ExecutionStore } from "../stores/execution-store.js";
import { ExecutionQueueClient } from "./execution-queue-client.js";

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

    const activityExecution = await this.props.activityStore.heartbeat(
      data.payload.executionId,
      data.payload.seq,
      this.baseTime().toISOString()
    );

    return {
      cancelled: activityExecution.cancelled,
    };
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
