import {
  EventualPromise,
  PropertyType,
  type Call,
  type CallOutput,
  type EventualHook,
  type Property,
} from "@eventual/core/internal";
import { AsyncLocalStorage } from "async_hooks";
import type { CallExecutor } from "./call-executor.js";
import {
  PropertyRetriever,
  getEventualProperty,
} from "./property-retriever.js";

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

export class DefaultEventualHook implements EventualHook {
  constructor(
    private executor: CallExecutor,
    private propertyRetriever: PropertyRetriever
  ) {}

  public executeEventualCall<P extends Call>(
    eventual: P
  ): EventualPromise<any> {
    return this.executor.execute(eventual) as CallOutput<P>;
  }

  public getEventualProperty<P extends Property = Property>(
    property: P
  ): PropertyType<P> {
    return getEventualProperty(
      property,
      this.propertyRetriever
    ) as PropertyType<P>;
  }
}

export async function enterEventualCallHookScope<R>(
  callExecutor: CallExecutor,
  propertyRetriever: PropertyRetriever,
  callback: () => R
): Promise<Awaited<R>> {
  return await globalThis.eventualCallHookStore.run(
    new DefaultEventualHook(callExecutor, propertyRetriever),
    callback
  );
}
