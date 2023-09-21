import type { TaskExecution, TaskStore } from "../../stores/task-store.js";
import { LocalSerializable } from "../local-persistance-store.js";

export class LocalTaskStore implements TaskStore, LocalSerializable {
  constructor(private tasks: Record<string, TaskExecution> = {}) {}

  public serialize(): Record<string, Buffer> {
    return { data: Buffer.from(JSON.stringify(this.tasks)) };
  }

  public static fromSerializedData(data?: Record<string, Buffer>) {
    return new LocalTaskStore(
      data && "data" in data
        ? JSON.parse(data.data.toString("utf-8"))
        : undefined
    );
  }

  public async claim(
    _executionId: string,
    _seq: number,
    _retry: number,
    _claimer?: string | undefined
  ): Promise<boolean> {
    // there is no risk of duplicate events locally
    return true;
  }

  public async heartbeat(
    executionId: string,
    seq: number,
    heartbeatTime: string
  ): Promise<TaskExecution> {
    const task = (this.tasks[`${executionId}${seq}`] ??= {
      executionId,
      seq,
      cancelled: false,
    });
    task.heartbeatTime = heartbeatTime;

    return task;
  }

  public async cancel(executionId: string, seq: number): Promise<void> {
    (this.tasks[`${executionId}${seq}`] ??= {
      executionId,
      seq,
      cancelled: true,
    }).cancelled = true;

    return Promise.resolve();
  }

  public async get(
    executionId: string,
    seq: number
  ): Promise<TaskExecution | undefined> {
    return this.tasks[`${executionId}${seq}`];
  }
}
