import { ActivityExecution, ActivityRuntimeClient } from "@eventual/core";

// TODO: implement activity heartbeat.
export class TestActivityRuntimeClient implements ActivityRuntimeClient {
  public async claimActivity(): Promise<boolean> {
    return true;
  }

  public async heartbeatActivity(
    _executionId: string,
    _seq: number,
    _heartbeatTime: string
  ): Promise<{ cancelled: boolean }> {
    return {
      cancelled: false,
    };
  }

  public cancelActivity(): Promise<void> {
    return Promise.resolve();
  }

  public async getActivity(
    executionId: string,
    seq: number
  ): Promise<ActivityExecution | undefined> {
    return { executionId, seq };
  }
}
