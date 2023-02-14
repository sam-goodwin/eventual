import { ActivityExecution, ActivityStore } from "@eventual/core-runtime";

export class TestActivityStore implements ActivityStore {
  public async claim(
    _executionId: string,
    _seq: number,
    _retry: number,
    _claimer?: string | undefined
  ): Promise<boolean> {
    return true;
  }

  public async heartbeat(
    _executionId: string,
    _seq: number,
    _heartbeatTime: string
  ): Promise<ActivityExecution> {
    return {
      executionId: _executionId,
      seq: _seq,
      claims: [],
      heartbeatTime: _heartbeatTime,
      cancelled: false,
    };
  }

  public async cancel(_executionId: string, _seq: number): Promise<void> {
    return Promise.resolve();
  }

  public async get(
    executionId: string,
    seq: number
  ): Promise<ActivityExecution | undefined> {
    return { executionId, seq, cancelled: false };
  }
}
