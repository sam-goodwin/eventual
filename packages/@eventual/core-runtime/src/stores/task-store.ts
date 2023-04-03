/**
 * Store which manages the {@link TaskExecution}s created by workflows.
 * It supports the exactly once contract, heartbeat, and cancellation features of tasks.
 *
 * A workflow first claims an {@link TaskExecution}, which should create the record.
 * Later attempts for the same {@link TaskExecution} will return false to signify the
 * {@link TaskExecution} is already being handled.
 *
 * While running, a task may be heartbeated or cancelled by any actor with access.
 * The {@link TimerClient} may `get` the task record to check if it is has been heartbeated recently.
 */
export interface TaskStore {
  /**
   * Claims a task for an actor.
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
   * Mark the last heartbeat time of a task.
   *
   * Note: This client does not handle all heartbeat logic, for example, checking if the workflow is cancelled.
   *       Use {@link TaskClient.sendHeartbeat} to heartbeat a task.
   */
  heartbeat(
    executionId: string,
    seq: number,
    heartbeatTime: string
  ): Promise<TaskExecution>;

  /**
   * Marks a task as cancelled. A task can use the {@link heartbeat} call
   * to retrieve this value.
   */
  cancel(executionId: string, seq: number): Promise<void>;

  /**
   * Retrieves the task to check the cancellation status, heartbeat, or other properties.
   */
  get(executionId: string, seq: number): Promise<TaskExecution | undefined>;
}

export interface TaskExecution {
  executionId: string;
  seq: number;
  claims?: string[];
  heartbeatTime?: string;
  cancelled: boolean;
}
