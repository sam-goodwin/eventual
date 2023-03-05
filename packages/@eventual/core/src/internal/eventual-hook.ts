import type { AsyncLocalStorage } from "async_hooks";
import { EventualCall } from "./calls/calls.js";
import { Result } from "./result.js";

/**
 * In the case that the workflow is bundled with a different instance of eventual/core,
 * put the store in globals.
 */
declare global {
  // eslint-disable-next-line no-var
  var eventualWorkflowHookStore:
    | AsyncLocalStorage<ExecutionWorkflowHook>
    | undefined;
}

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
  return globalThis.eventualWorkflowHookStore?.getStore();
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

export async function enterWorkflowHookScope<R>(
  eventualHook: ExecutionWorkflowHook,
  callback: (...args: any[]) => R
) {
  if (!globalThis.eventualWorkflowHookStore) {
    globalThis.eventualWorkflowHookStore = new (
      await import("async_hooks")
    ).AsyncLocalStorage();
  }
  return globalThis.eventualWorkflowHookStore.run(eventualHook, callback);
}
