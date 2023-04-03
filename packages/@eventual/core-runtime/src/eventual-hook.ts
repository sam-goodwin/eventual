import { DEFAULT_HOOK, EventualCallHook } from "@eventual/core/internal";
import { AsyncLocalStorage } from "async_hooks";

const eventualCallHookStore = new AsyncLocalStorage<EventualCallHook>();

// override the getEventualCallHook to return from the AsyncLocalStore.
globalThis.getEventualCallHook = () => {
  return eventualCallHookStore.getStore() ?? DEFAULT_HOOK;
};

export async function enterEventualCallHookScope<R>(
  eventualHook: EventualCallHook,
  callback: () => R
): Promise<R> {
  return eventualCallHookStore.run(eventualHook, callback);
}
