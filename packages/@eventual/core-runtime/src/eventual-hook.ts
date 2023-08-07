import { type EventualHook } from "@eventual/core/internal";
import { AsyncLocalStorage } from "async_hooks";

declare global {
  // eslint-disable-next-line no-var
  var eventualCallHookStore: AsyncLocalStorage<EventualHook>;
}

/**
 * If eventualCallHook is already defined, then this override was already done.
 */
if (!globalThis.eventualCallHookStore) {
  // override the getEventualCallHook to return from the AsyncLocalStore.
  globalThis.getEventualHook = () => {
    const hook = globalThis.eventualCallHookStore.getStore();
    if (!hook) {
      throw new Error("Eventual Hook was not registered");
    }
    return hook;
  };
  globalThis.tryGetEventualHook = () => {
    return globalThis.eventualCallHookStore.getStore();
  };

  globalThis.eventualCallHookStore = new AsyncLocalStorage<EventualHook>();
}

export async function enterEventualCallHookScope<R>(
  eventualHook: EventualHook,
  callback: () => R
): Promise<Awaited<R>> {
  return await globalThis.eventualCallHookStore.run(eventualHook, callback);
}
