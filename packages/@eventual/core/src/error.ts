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
 * const myTask = new task("myTask", {timeout: duration(100, "seconds") }, async () => { ... });
 * workflow("myWorkflow", async () => {
 *    try {
 *       await myTask();
 *       return "task did not time out!";
 *    } catch (err) {
 *       if(err instanceof Timeout) {
 *          return "task timed out!";
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
 * Thrown when an task fails to send heartbeats.
 *
 * ```ts
 * const myTask = new task("myTask", {heartbeatSeconds: 10}, async () => { ... });
 * workflow("myWorkflow", async () => {
 *    try {
 *       await myTask();
 *       return "task completed successfully!";
 *    } catch (err) {
 *       if(err instanceof HeartbeatTimeout) {
 *          return "task did not send heartbeats!";
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
 * Thrown when an task id is not found in the service.
 */
export class TaskNotFoundError extends Error {
  constructor(taskName: string, availableNames: string[]) {
    super(
      `Could not find an task with the name ${taskName}, found: ${availableNames.join(
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
 * Thrown from the {@link Entity} set or delete when the expected version is incorrect.
 */
export class UnexpectedVersion extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown from {@link Entity.transactWrite} when an error is encountered
 * that cancels the transaction.
 *
 * Returns reasons in the same order as the input items.
 */
export class TransactionCancelled extends Error {
  constructor(public reasons: (UnexpectedVersion | undefined)[]) {
    super("Transactions Cancelled, see reasons");
  }
}
