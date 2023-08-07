import {
  DurationSchedule,
  ExecutionStatus,
  SendTaskFailureRequest,
  SendTaskHeartbeatRequest,
  SendTaskSuccessRequest,
} from "@eventual/core";
import {
  TaskFailed,
  TaskSucceeded,
  WorkflowEventType,
} from "@eventual/core/internal";
import type { ExecutionStore } from "../stores/execution-store.js";
import type { TaskStore } from "../stores/task-store.js";
import { decodeTaskToken } from "../task-token.js";
import { createEvent } from "../workflow/events.js";
import type { ExecutionQueueClient } from "./execution-queue-client.js";

export interface TaskClientProps {
  taskStore: TaskStore;
  executionStore: ExecutionStore;
  executionQueueClient: ExecutionQueueClient;
  baseTime?: () => Date;
}

export abstract class TaskClient {
  private baseTime: () => Date;
  constructor(private props: TaskClientProps) {
    this.baseTime = props.baseTime ?? (() => new Date());
  }

  public async sendHeartbeat(
    request: Omit<SendTaskHeartbeatRequest, "type">
  ): Promise<{ cancelled: boolean }> {
    const data = decodeTaskToken(request.taskToken);

    const execution = await this.props.executionStore.get(
      data.payload.executionId
    );

    if (execution?.status !== ExecutionStatus.IN_PROGRESS) {
      return { cancelled: true };
    }

    const taskExecution = await this.props.taskStore.heartbeat(
      data.payload.executionId,
      data.payload.seq,
      this.baseTime().toISOString()
    );

    return {
      cancelled: taskExecution.cancelled,
    };
  }

  /**
   * Succeeds an async task causing it to return the given value.
   */
  public async sendSuccess({
    taskToken,
    result,
  }: Omit<SendTaskSuccessRequest, "type">): Promise<void> {
    await this.sendTaskResult<TaskSucceeded>(taskToken, {
      type: WorkflowEventType.TaskSucceeded,
      result,
    });
  }

  /**
   * Fails an async task causing it to throw the given error.
   */
  public async sendFailure({
    taskToken,
    error,
    message,
  }: Omit<SendTaskFailureRequest, "type">): Promise<void> {
    await this.sendTaskResult<TaskFailed>(taskToken, {
      type: WorkflowEventType.TaskFailed,
      error,
      message,
    });
  }

  private async sendTaskResult<E extends TaskSucceeded | TaskFailed>(
    taskToken: string,
    event: Omit<E, "seq" | "duration" | "timestamp">
  ) {
    const data = decodeTaskToken(taskToken);
    await this.props.executionQueueClient.submitExecutionEvents(
      data.payload.executionId,
      createEvent<TaskSucceeded | TaskFailed>(
        {
          ...event,
          seq: data.payload.seq,
        },
        this.baseTime()
      )
    );
  }

  public abstract startTask(request: TaskWorkerRequest): Promise<void>;
}

export interface TaskWorkerRequest {
  scheduledTime: string;
  workflowName: string;
  executionId: string;
  taskName: string;
  seq: number;
  heartbeat?: DurationSchedule;
  input?: any;
  retry: number;
}

export function isTaskWorkerRequest(obj: any): obj is TaskWorkerRequest {
  return obj && "retry" in obj && "taskName" in obj;
}
