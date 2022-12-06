import { ScheduleActivityCommand } from "../../command.js";

export interface ActivityRuntimeClient {
  /**
   * Claims a activity for an actor.
   *
   * Future invocations of the same executionId + future.seq + retry will fail.
   *
   * @param claimer optional string to correlate the lock to the claimer.
   * @return a boolean determining if the claim was granted to the current actor.
   **/
  requestExecutionActivityClaim(
    executionId: string,
    command: ScheduleActivityCommand,
    retry: number,
    claimer?: string
  ): Promise<boolean>;
}
