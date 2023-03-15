export const ActivityNameDimension = "ActivityName";
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
export const ActivitySucceeded = "ActivitySucceeded";
/**
 * The total duration of the activity after being scheduled, including the time
 * waiting to be executed.
 */
export const TotalDuration = "TotalDuration";
/**
 * amount of time it took to submit a workflow task to SQS to resume the workflow.
 */
export const SubmitWorkflowTaskDuration = "SubmitWorkflowTaskDuration";
/**
 * Number of milliseconds it takes to send execution logs to where ever they are persisted.
 */
export const ActivityLogWriteDuration = "ActivityLogWriteMillis";
