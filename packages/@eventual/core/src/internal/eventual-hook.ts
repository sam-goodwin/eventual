import type { EventualCall, EventualCallOutput } from "./calls.js";
import { EventualProperty, EventualPropertyType } from "./properties.js";
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

export interface EventualHook {
  /**
   * Execute async operation.
   */
  executeEventualCall<E extends EventualCall = EventualCall>(
    eventual: E
  ): EventualPromise<EventualCallOutput<E>>;
  /**
   * Retrieve constant properties.
   */
  getEventualProperty<P extends EventualProperty = EventualProperty>(
    property: P
  ): EventualPropertyType<P>;
  resolveEventual(seq: number, result: Result<any>): void;
}
