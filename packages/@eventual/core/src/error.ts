export class DeterminismError extends Error {}
export class Timeout extends Error {}
/**
 * Thrown when an activity fails to send heartbeats.
 */
export class HeartbeatTimeout extends Error {}
/**
 * Thrown when a particular context only support synchronous operations (ex: condition predicate).
 */
export class SynchronousOperationError extends Error {}
