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
export const VersionV2 = "v2";
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
 * The amount of time it takes to start all of the calls returned by the workflow code.
 */
export const InvokeCallsDuration = "InvokeCallsDuration";
/**
 * The number of calls returned by the workflow.
 */
export const CallsInvoked = "CallsInvoked";
/**
 * Tracks the time it takes for a workflow task to be scheduled until new calls could be emitted.
 * This represent the workflow orchestration time of User Perceived Latency
 * Average expected time for an activity to be invoked until it is considered complete by the workflow should follow:
 * AvgActivityDuration(N) = Avg(TimeToCallsInvoked) + Avg(ActivityDuration(N))
 */
export const TimeToCallsInvoked = "TimeToCallsInvoked";
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
 * Emitted by orchestrator when the execution starts.
 */
export const ExecutionStarted = "ExecutionStarted";
/**
 * Time between the first workflow started event and the first execution run.
 *
 * This should represent the time the runtime takes to actually start a workflow.
 */
export const ExecutionStartedDuration = "ExecutionStartedDuration";
/**
 * Emitted by orchestrator when the execution completes.
 */
export const ExecutionCompleted = "ExecutionCompleted";
/**
 * Whether the execution completed without error.
 */
export const ExecutionSucceeded = "ExecutionSucceeded";
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
 * Number of milliseconds between the expected timer wakeup time and the actual incoming {@link TimerCompleted} event.
 */
export const TimerVarianceDuration = "TimerVarianceDuration";
/**
 * Number of milliseconds it takes to send execution logs to where ever they are persisted.
 */
export const ExecutionLogWriteDuration = "ExecutionLogWriteDuration";
/**
 * 1 when a workflow has a timeout and 0 when it does not.
 */
export const TimeoutStarted = "TimeoutStarted";
/**
 * When a workflow has a timeout, measures the time it takes to start the timeout.
 */
export const TimeoutStartedDuration = "TimeoutStartedDuration";
