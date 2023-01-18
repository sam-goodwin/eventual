export interface ActivityStore {
  /**
   * Claims a activity for an actor.
   *
   * Future invocations of the same executionId + future.seq + retry will fail.
   *
   * @param claimer optional string to correlate the lock to the claimer.
   * @return a boolean determining if the claim was granted to the current actor.
   **/
  claim(
    executionId: string,
    seq: number,
    retry: number,
    claimer?: string
  ): Promise<boolean>;

  /**
   * Mark the last heartbeat time of an activity.
   */
  heartbeat(
    executionId: string,
    seq: number,
    heartbeatTime: string
  ): Promise<{ cancelled: boolean }>;

  /**
   * Marks an activity as cancelled. An activity can use the {@link heartbeat} call
   * to retrieve this value.
   */
  cancel(executionId: string, seq: number): Promise<void>;

  /**
   * Retrieves the activity to check the cancellation status, heartbeat, or other properties.
   */
  get(executionId: string, seq: number): Promise<ActivityExecution | undefined>;
}

export interface ActivityExecution {
  executionId: string;
  seq: number;
  claims?: string[];
  heartbeatTime?: string;
  cancelled?: boolean;
}
