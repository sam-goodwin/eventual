import { EventualCall } from "./calls/calls.js";
import { Result } from "./result.js";

/**
 * In the case that the workflow is bundled with a different instance of eventual/core,
 * put the store in globals.
 */
declare global {
  // eslint-disable-next-line no-var
  var eventualCallHookStore: EventualCallHook | undefined;
}

export const EventualPromiseSymbol =
  /* @__PURE__ */ Symbol.for("Eventual:Promise");

export interface EventualPromise<R> extends Promise<R> {
  /**
   * The sequence number associated with the Eventual for the execution.
   */
  [EventualPromiseSymbol]: number;
}

export interface EventualCallHook<
  E extends EventualPromise<any> = EventualPromise<any>
> {
  registerEventualCall(eventual: EventualCall): E;
  resolveEventual(seq: number, result: Result<any>): void;
}

export function tryGetWorkflowHook() {
  return globalThis.eventualCallHookStore;
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

export async function enterEventualCallHookScope<R>(
  eventualHook: EventualCallHook,
  callback: () => R
): Promise<Awaited<R>> {
  if (globalThis.eventualCallHookStore !== undefined) {
    throw new Error("Must clear eventual hook before registering a new one.");
  }
  try {
    globalThis.eventualCallHookStore = eventualHook;
    return await callback();
  } finally {
    globalThis.eventualCallHookStore = undefined;
  }
}
