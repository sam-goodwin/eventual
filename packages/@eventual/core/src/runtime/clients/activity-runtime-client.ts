export interface ActivityRuntimeClient {
  /**
   * Claims a activity for an actor.
   *
   * Future invocations of the same executionId + future.seq + retry will fail.
   *
   * @param claimer optional string to correlate the lock to the claimer.
   * @return a boolean determining if the claim was granted to the current actor.
   **/
  claimActivity(
    executionId: string,
    seq: number,
    retry: number,
    claimer?: string
  ): Promise<boolean>;

  /**
   * Mark the last heartbeat time of an activity.
   */
  heartbeatActivity(
    executionId: string,
    seq: number,
    heartbeatTime: string
  ): Promise<HeartbeatResponse>;

  /**
   * Marks an activity as closed. An activity can use the {@link heartbeat} call
   * to retrieve this value.
   */
  closeActivity(
    executionId: string,
    seq: number
  ): Promise<{ alreadyClosed: boolean }>;

  /**
   * Retrieves the activity to check the cancellation status, heartbeat, or other properties.
   */
  getActivity(
    executionId: string,
    seq: number
  ): Promise<ActivityExecution | undefined>;
}

export interface ActivityExecution {
  executionId: string;
  seq: number;
  claims?: string[];
  heartbeatTime?: string;
  closed?: boolean;
}

export interface HeartbeatResponse {
  /**
   * True when the activity has already completed elsewhere.
   *
   * This is the only way for a long running activity to know that the activity
   * is no longer looking for a result.
   */
  closed: boolean;
}
