export namespace MetricsCommon {
  export const EventualNamespace = "Eventual";
  export const WorkflowNameDimension = "WorkflowName";
}

export namespace OrchestratorMetrics {
  /**
   * Number of events which were delivered with the current batch of {@link WorkflowTask}s.
   */
  export const TaskEvents = "TaskEvents";
  /**
   * Number of workflow tasks being batch executed by the orchestrator for an execution id.
   */
  export const AggregatedTasks = "AggregatedTasks";
  /**
   * Execution ID of the {@link WorkflowTask}s being evaluated.
   */
  export const ExecutionId = "ExecutionId";
  /**
   * Version of the orchestrator.
   */
  export const Version = "Version";
  export const VersionV1 = "v1";
  /**
   * The greatest amount of time a {@link WorkflowTask} being processed has waited in the Workflow Queue.
   *
   * Used to determine when the workflow queue is falling behind (maxTaskAge is growing).
   */
  export const MaxTaskAge = "MaxTaskAge";
  /**
   * The time it takes to load history data from S3.
   */
  export const LoadHistoryDuration = "LoadHistoryDuration";
  /**
   * The number of events present in the history file.
   */
  export const LoadedHistoryEvents = "LoadedHistoryEvents";
  /**
   * The amount of time it takes to run the workflow code to progress the {@link Execution}.
   */
  export const AdvanceExecutionDuration = "AdvanceExecutionDuration";
  /**
   * The number of events submitted to the workflow code to replay and advance the {@link Execution}.
   */
  export const AdvanceExecutionEvents = "AdvanceExecutionEvents";
  /**
   * The amount of time it takes to start all of the commands returned by the workflow code.
   */
  export const InvokeCommandsDuration = "InvokeCommandsDuration";
  /**
   * The number of commands returned by the workflow.
   */
  export const CommandsInvoked = "CommandsInvoked";
  /**
   * Tracks the time it takes for a workflow task to be scheduled until new commands could be emitted.
   * This represent the workflow orchestration time of User Perceived Latency
   * Average expected time for an activity to be invoked until it is considered complete by the workflow should follow:
   * AvgActivityDuration(N) = Avg(TimeToCommandsInvoked) + Avg(ActivityDuration(N))
   */
  export const TimeToCommandsInvoked = "TimeToCommandsInvoked";
  /**
   * Amount of time it takes to write history back to s3.
   */
  export const SaveHistoryDuration = "SaveHistoryDuration";
  /**
   * Number of events written to s3.
   */
  export const SavedHistoryEvents = "SavedHistoryEvents";
  /**
   * Size of the history fle written in bytes.
   */
  export const SavedHistoryBytes = "SavedHistoryBytes";
  /**
   * Amount of time it takes to update the workflow entry with a Complete or Failed status.
   */
  export const ExecutionStatusUpdateDuration = "ExecutionStatusUpdateDuration";
  /**
   * Amount of time it take to add newly generated events to dynamo.
   */
  export const AddNewExecutionEventsDuration = "AddNewExecutionEventsDuration";
  /**
   * Number of new events generated evaluating the current Workflow Tasks batch.
   */
  export const NewExecutionEvents = "NewExecutionEvents";
  /**
   * Whether the execution completed without error.
   */
  export const ExecutionComplete = "ExecutionComplete";
  /**
   * Whether the execution completed with an error.
   */
  export const ExecutionFailed = "ExecutionFailed";
  /**
   * Total time it took the workflow to complete.
   */
  export const ExecutionTotalDuration = "ExecutionTotalDuration";
  /**
   * The size of the workflow result in bytes.
   */
  export const ExecutionResultBytes = "ExecutionResultBytes";
  /**
   * Number of milliseconds between the expected sleep wakeup time and the actual incoming {@link SleepCompleted} event.
   */
  export const SleepVarianceMillis = "SleepVarianceMillis";
  /**
   * 1 when a workflow has a timeout and 0 when it does not.
   */
  export const TimeoutStarted = "TimeoutStarted";
  /**
   * When a workflow has a timeout, measures the time it takes to start the timeout.
   */
  export const TimeoutStartedDuration = "TimeoutStartedDuration";
}

export namespace ActivityMetrics {
  /**
   * The age of the request, or the time from when it was sent to when it was started processing.
   */
  export const ActivityRequestAge = "ActivityRequestAge";
  /**
   * The amount of time it took to claim (lock) the activity to enforce exactly once processing.
   */
  export const ClaimDuration = "ClaimDuration";
  /**
   * Whether this activity invocation was rejected when claiming the activity.
   */
  export const ClaimRejected = "ClaimRejected";
  /**
   * Whether an error was thrown that the activity name could not be found.
   */
  export const NotFoundError = "NotFoundError";
  /**
   * The amount of time it took to run the activity's code.
   */
  export const OperationDuration = "OperationDuration";
  /**
   * Whether this activity returned a result or not on completion.
   */
  export const HasResult = "HasResult";
  /**
   * Returned {@link asyncResult}.
   */
  export const AsyncResult = "AsyncResult";
  /**
   * The size in bytes of the result generated by the activity, if one was generated.
   */
  export const ResultBytes = "ResultBytes";
  /**
   * Whether the activity completed with errors.
   */
  export const ActivityFailed = "ActivityFailed";
  /**
   * Whether the activity completed without error.
   */
  export const ActivityCompleted = "ActivityCompleted";
  /**
   * The total duration of the activity after being scheduled, including the time
   * waiting to be executed.
   */
  export const TotalDuration = "TotalDuration";
  /**
   * Amount of time it took to send workflow events.
   */
  export const EmitEventDuration = "EmitEventDuration";
  /**
   * amount of time it took to submit a workflow task to SQS to resume the workflow.
   */
  export const SubmitWorkflowTaskDuration = "SubmitWorkflowTaskDuration";
}

export namespace SchedulerForwarderMetrics {
  /**
   * The time between the scheduler trigger time and the Scheduler Forwarder seeing the message.
   */
  export const SchedulerTimeDelay = "SchedulerTimeDelay";
  /**
   * Seconds the timer queue is told to wait until handling the request.
   */
  export const TimerQueueDelaySeconds = "TimerQueueDelaySeconds";
}
