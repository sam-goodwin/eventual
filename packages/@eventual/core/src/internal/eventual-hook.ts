import { AsyncLocalStorage } from "async_hooks";
import { EventualCall } from "./calls/calls.js";
import { Result } from "./result.js";

const storage = new AsyncLocalStorage<ExecutionWorkflowHook>();

export const EventualPromiseSymbol = Symbol.for("Eventual:Promise");

export interface EventualPromise<R> extends Promise<R> {
  /**
   * The sequence number associated with the Eventual for the execution.
   */
  [EventualPromiseSymbol]: number;
}

export function createEventualPromise<R>(
  promise: Promise<R>,
  seq: number
): EventualPromise<R> {
  const _promise = promise as EventualPromise<R>;
  _promise[EventualPromiseSymbol] = seq;
  return _promise;
}

export interface ExecutionWorkflowHook {
  registerEventualCall<R>(eventual: EventualCall): EventualPromise<R>;
  resolveEventual<R>(seq: number, result: Result<R>): void;
}

export function tryGetWorkflowHook() {
  return storage.getStore();
}

export function getWorkflowHook() {
  const hook = tryGetWorkflowHook();

  if (!hook) {
    throw new Error(
      "EventualHook cannot be retrieved outside of a Workflow Executor."
    );
  }

  return hook;
}

export function registerWorkflowHook(eventualHook: ExecutionWorkflowHook) {
  storage.enterWith(eventualHook);
}
