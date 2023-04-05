import { DEFAULT_HOOK, EventualCallHook } from "@eventual/core/internal";
import { AsyncLocalStorage } from "async_hooks";

declare global {
  var eventualCallHookStore: AsyncLocalStorage<EventualCallHook>;
}

/**
 * If eventualCallHook is already defined, then this override was already done.
 */
if (!globalThis.eventualCallHookStore) {
  // override the getEventualCallHook to return from the AsyncLocalStore.
  globalThis.getEventualCallHook = () => {
    return globalThis.eventualCallHookStore.getStore() ?? DEFAULT_HOOK;
  };

  globalThis.eventualCallHookStore = new AsyncLocalStorage<EventualCallHook>();
}

export async function enterEventualCallHookScope<R>(
  eventualHook: EventualCallHook,
  callback: () => R
): Promise<R> {
  return globalThis.eventualCallHookStore.run(eventualHook, callback);
}
