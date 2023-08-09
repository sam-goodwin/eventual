import type { Call, CallOutput } from "./calls.js";
import type { Property, PropertyType } from "./properties.js";

/**
 * Globals that may be overridden by the core-runtime. See matching core-runtime file to understand
 * the specific behavior.
 *
 * In this case, we'll provide a default no-op hook function.
 * When someone uses the enterEventualCallHookScope in runtime, the getEventualCallHook function
 * will be overridden to return that hook (based on async scope.)
 */
declare global {
  export function getEventualHook(): EventualHook;
  export function tryGetEventualHook(): EventualHook | undefined;
}

export const EventualPromiseSymbol =
  /* @__PURE__ */ Symbol.for("Eventual:Promise");

export interface EventualPromise<R> extends Promise<R> {
  /**
   * The sequence number associated with the Eventual for the execution.
   */
  [EventualPromiseSymbol]: number;
}

globalThis.getEventualHook ??= () => {
  throw new Error("Eventual Hook is not yet registered");
};
globalThis.tryGetEventualHook ??= () => {
  return undefined;
};

export interface EventualHook {
  /**
   * Execute async operation.
   */
  executeEventualCall<E extends Call = Call>(
    eventual: E
  ): EventualPromise<Awaited<CallOutput<E>>>;
  /**
   * Retrieve constant properties.
   */
  getEventualProperty<P extends Property = Property>(
    property: P
  ): PropertyType<P>;
}
