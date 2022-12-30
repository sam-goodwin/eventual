export class EventualError extends Error {
  constructor(name: string, message?: string) {
    super(message);
    this.name = name;
  }

  /**
   * Provides a reasonable form when running JSON.stringify.
   */
  public toJSON() {
    return {
      name: this.name,
      ...(this.message ? { message: this.message } : {}),
    };
  }
}
export class DeterminismError extends EventualError {
  constructor(message?: string) {
    super("DeterminismError", message);
  }
}
/**
 * Thrown from within a workflow when any set timeout expires.
 *
 * ```ts
 * const myAct = new activity("myAct", {timeoutSeconds: 100}, async () => { ... });
 * workflow("myWorkflow", async () => {
 *    try {
 *       await myAct();
 *       return "activity did not time out!";
 *    } catch (err) {
 *       if(err instanceof Timeout) {
 *          return "activity timed out!";
 *       }
 *       throw err;
 *    }
 * })
 * ```
 */
export class Timeout extends EventualError {
  constructor(message?: string) {
    super("Timeout", message);
  }
}

/**
 * Thrown when an activity fails to send heartbeats.
 *
 * ```ts
 * const myAct = new activity("myAct", {heartbeatSeconds: 10}, async () => { ... });
 * workflow("myWorkflow", async () => {
 *    try {
 *       await myAct();
 *       return "activity completed successfully!";
 *    } catch (err) {
 *       if(err instanceof HeartbeatTimeout) {
 *          return "activity did not send heartbeats!";
 *       }
 *       throw err;
 *    }
 * })
 * ```
 */
export class HeartbeatTimeout extends Timeout {
  constructor(message?: string) {
    super(message);
    this.name = "HeartbeatTimeout";
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

/**
 * Thrown when an activity id is not found in the service.
 */
export class ActivityNotFoundError extends Error {
  constructor(activityName: string, availableNames: string[]) {
    super(
      `Could not find an activity with the name ${activityName}, found: ${availableNames.join(
        ","
      )}`
    );
  }
}
