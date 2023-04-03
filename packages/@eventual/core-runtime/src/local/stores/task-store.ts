import type { TaskExecution, TaskStore } from "../../stores/task-store.js";

export class LocalTaskStore implements TaskStore {
  private tasks: Record<string, TaskExecution> = {};
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
