export class DeterminismError extends Error {}
export class Timeout extends Error {}
export class HeartbeatTimeout extends Error {
  constructor(
    message: string,
    public heartbeatTimeoutTimestamp: string,
    public lastHeartbeatTimestamp?: string
  ) {
    super(message);
  }
}
/**
 * Thrown when a particular context only support synchronous operations (ex: condition predicate).
 */
export class SynchronousOperationError extends Error {}
