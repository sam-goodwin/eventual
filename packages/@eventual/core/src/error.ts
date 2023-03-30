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

export class SystemError extends EventualError {
  constructor(name?: string, message?: string) {
    super(name ?? "SystemError", message);
  }
}

export class DeterminismError extends SystemError {
  constructor(message?: string) {
    super("DeterminismError", message);
  }
}

/**
 * Thrown from within a workflow when any set timeout expires.
 *
 * ```ts
 * const myAct = new activity("myAct", {timeout: duration(100, "seconds") }, async () => { ... });
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
 * Thrown when the workflow times out.
 *
 * After a workflow times out, events are no longer accepted
 * and commands are no longer executed.
 */
export class WorkflowTimeout extends SystemError {
  constructor(message?: string) {
    super("WorkflowTimeout", message);
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

export class ExecutionAlreadyExists extends Error {
  constructor(name: string, workflowName: string) {
    super(
      `Execution name ${name} already exists for workflow ${workflowName} with different inputs.`
    );
  }
}

/**
 * Thrown from the {@link Dictionary} set or delete when the expected version is incorrect.
 */
export class UnexpectedVersion extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown from {@link Dictionary.transactWrite} when an error is encountered
 * that cancels the transaction.
 *
 * Returns reasons in the same order as the input items.
 */
export class TransactionCancelled extends Error {
  constructor(public reasons: (UnexpectedVersion | undefined)[]) {
    super("Transactions Cancelled, see reasons");
  }
}
