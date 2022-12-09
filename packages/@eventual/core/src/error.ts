export class EventualError extends Error {
  constructor(name: string, message?: string) {
    super(message);
    this.name = name;
  }
  /**
   * Provides a reasonable form when running JSON.stringify.
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
    };
  }
}
export class DeterminismError extends EventualError {
  constructor(message?: string) {
    super("DeterminismError", message);
  }
}
export class Timeout extends EventualError {
  constructor(message?: string) {
    super("Timeout", message);
  }
}
/**
 * Thrown when an activity fails to send heartbeats.
 */
export class HeartbeatTimeout extends EventualError {
  constructor(message?: string) {
    super("HeartbeatTimeout", message);
  }
}
/**
 * Thrown when a particular context only support synchronous operations (ex: condition predicate).
 */
export class SynchronousOperationError extends EventualError {
  constructor(message?: string) {
    super("SynchronousOperationError", message);
  }
}
