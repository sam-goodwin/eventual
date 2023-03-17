import type {
  ActivityExecution,
  ActivityStore,
} from "../../stores/activity-store.js";

export class LocalActivityStore implements ActivityStore {
  private activities: Record<string, ActivityExecution> = {};
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
  ): Promise<ActivityExecution> {
    const activity = (this.activities[`${executionId}${seq}`] ??= {
      executionId,
      seq,
      cancelled: false,
    });
    activity.heartbeatTime = heartbeatTime;

    return activity;
  }

  public async cancel(executionId: string, seq: number): Promise<void> {
    (this.activities[`${executionId}${seq}`] ??= {
      executionId,
      seq,
      cancelled: true,
    }).cancelled = true;

    return Promise.resolve();
  }

  public async get(
    executionId: string,
    seq: number
  ): Promise<ActivityExecution | undefined> {
    return this.activities[`${executionId}${seq}`];
  }
}
