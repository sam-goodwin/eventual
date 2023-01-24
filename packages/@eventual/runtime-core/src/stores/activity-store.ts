/**
 * Store which manages the {@link ActivityExecution}s created by workflows.
 * It supports the exactly once contract, heartbeat, and cancellation features of activities.
 *
 * A workflow first claims an {@link ActivityExecution}, which should create the record.
 * Later attempts for the same {@link ActivityExecution} will return false to signify the
 * {@link ActivityExecution} is already being handled.
 *
 * While running, an activity may be heartbeated or cancelled by any actor with access.
 * The {@link TimerClient} may `get` the activity record to check if it is has been heartbeated recently.
 */
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
   *
   * Note: This client does not handle all heartbeat logic, for example, checking if the workflow is cancelled.
   *       Use {@link ActivityClient.sendHeartbeat} to heartbeat an activity.
   */
  heartbeat(
    executionId: string,
    seq: number,
    heartbeatTime: string
  ): Promise<ActivityExecution>;

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
  cancelled: boolean;
}
