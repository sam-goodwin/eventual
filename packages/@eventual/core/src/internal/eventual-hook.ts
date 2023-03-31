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

export class PassThroughEventualHook implements EventualCallHook {
  registerEventualCall<
    R,
    E extends EventualCall | undefined = EventualCall | undefined
  >(eventual: E, passThrough: (eventualCall: E) => Promise<R>) {
    return passThrough(eventual) as unknown as EventualPromise<R>;
  }

  resolveEventual(_seq: number, _result: Result<any>): void {
    throw new Error("Cannot resolve an eventual in passthrough mode");
  }
}

const DEFAULT_HOOK = new PassThroughEventualHook();

export interface EventualPromise<R> extends Promise<R> {
  /**
   * The sequence number associated with the Eventual for the execution.
   */
  [EventualPromiseSymbol]: number;
}

export interface EventualCallHook {
  registerEventualCall<
    R,
    E extends EventualCall | undefined = EventualCall | undefined
  >(
    eventual: E,
    passThrough: (eventualCall: E) => Promise<R>
  ): EventualPromise<R>;
  resolveEventual(seq: number, result: Result<any>): void;
}

export function getEventualCallHook() {
  return globalThis.eventualCallHookStore ?? DEFAULT_HOOK;
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
