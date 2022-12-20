import { ActivityExecution, ActivityRuntimeClient } from "@eventual/core";

// TODO: does this need to be implemented?
export class TestActivityRuntimeClient implements ActivityRuntimeClient {
  async claimActivity(): Promise<boolean> {
    return true;
  }
  async heartbeatActivity(
    _executionId: string,
    _seq: number,
    _heartbeatTime: string
  ): Promise<{ cancelled: boolean }> {
    return {
      cancelled: false,
    };
  }
  async cancelActivity(): Promise<void> {
    return;
  }
  async getActivity(
    executionId: string,
    seq: number
  ): Promise<ActivityExecution | undefined> {
    return { executionId, seq };
  }
}
