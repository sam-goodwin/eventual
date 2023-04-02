import type { EventualCall } from "./calls/calls.js";
import type { Result } from "./result.js";

/**
 * Globals that may be overridden by the core-runtime. See matching core-runtime file to understand
 * the specific behavior.
 * 
 * In this case, we'll provide a default no-op hook function.
 * When someone uses the enterEventualCallHookScope in runtime, the getEventualCallHook function
 * will be overridden to return that hook (based on async scope.)
 */
declare global {
  export function getEventualCallHook(): EventualCallHook;
}

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

export const DEFAULT_HOOK = new PassThroughEventualHook();

// default implementation of getEventualCallHook that does nothing.
// to be overridden by the core-runtime as needed.
globalThis.getEventualCallHook = () => DEFAULT_HOOK;

export const EventualPromiseSymbol =
  /* @__PURE__ */ Symbol.for("Eventual:Promise");

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
