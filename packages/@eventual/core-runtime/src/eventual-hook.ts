import {
  EventualCallKind,
  EventualCallOutput,
  EventualCallSymbol,
  EventualProperty,
  EventualPropertyKind,
  EventualPropertySymbol,
  EventualPropertyType,
  type EventualCall,
  type EventualHook,
  type EventualPromise,
  ServiceSpec,
} from "@eventual/core/internal";
import { AsyncLocalStorage } from "async_hooks";
import { LazyValue } from "./utils.js";
import { EventualServiceClient } from "@eventual/core";
import { Client } from "@opensearch-project/opensearch";
import { BucketStore } from "./index.js";

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

export interface EventualExecutor<E extends EventualCall = EventualCall> {
  execute(
    call: E
  ): EventualPromise<EventualCallOutput<E>> | Promise<EventualCallOutput<E>>;
}

export type EventualPropertyRetriever<
  P extends EventualProperty = EventualProperty
> =
  | EventualPropertyResolver<P>
  | LazyValue<EventualPropertyType<P>>
  | ((property: P) => EventualPropertyType<P>);

export interface EventualPropertyResolver<
  P extends EventualProperty = EventualProperty
> {
  getProperty(property: P): EventualPropertyType<P>;
}

export function getEventualProperty(
  property: EventualProperty,
  retriever: EventualPropertyRetriever
) {
  if (typeof retriever === "function") {
    return retriever(property);
  } else if (typeof retriever === "object" && "getProperty" in retriever) {
    return retriever.getProperty(property);
  } else {
    return retriever;
  }
}

export type EventualCallExecutorCollection = {
  [K in keyof typeof EventualCallKind]: EventualExecutor<
    EventualCall & { [EventualCallSymbol]: (typeof EventualCallKind)[K] }
  >;
};

export type EventualPropertyRetrieverCollection = {
  [K in keyof typeof EventualPropertyKind]: EventualPropertyRetriever<
    EventualProperty & {
      [EventualPropertySymbol]: (typeof EventualPropertyKind)[K];
    }
  >;
};

export class UnsupportedExecutor<E extends EventualCall = EventualCall>
  implements EventualExecutor<E>
{
  constructor(private name: string) {}
  public execute(_call: E): EventualPromise<any> {
    throw new Error(
      `Call type ${
        EventualCallKind[_call[EventualCallSymbol]]
      } is not supported by ${this.name}.`
    );
  }
}

/**
 * An executor that can execute any eventual executor.
 */
export class AnyEventualCallExecutor implements EventualExecutor {
  constructor(private executors: EventualCallExecutorCollection) {}
  public execute<E extends EventualCall>(call: E) {
    const kind = call[EventualCallSymbol];
    const executor = this.executors[
      EventualCallKind[kind] as keyof typeof EventualCallKind
    ] as EventualExecutor | undefined;

    if (executor) {
      return executor.execute(call) as unknown as EventualPromise<any>;
    }

    throw new Error(`Missing Executor for ${EventualCallKind[kind]}`);
  }
}

export class UnsupportedPropertyRetriever<
  P extends EventualProperty = EventualProperty
> implements EventualPropertyResolver<P>
{
  constructor(private name: string) {}
  public getProperty(_property: P): any {
    throw new Error(
      `Property ${
        EventualPropertyKind[_property[EventualPropertySymbol]]
      } is not supported by ${this.name}.`
    );
  }
}

/**
 * Aggregated Property Retriever that supports any eventual property.
 */
export class AnyPropertyRetriever implements EventualPropertyResolver {
  constructor(private retrievers: EventualPropertyRetrieverCollection) {}

  public getProperty<P extends EventualProperty>(
    property: P
  ): string | Client | EventualServiceClient | ServiceSpec {
    const retriever = this.retrievers[
      EventualPropertyKind[
        property[EventualPropertySymbol]
      ] as keyof typeof EventualPropertyKind
    ] as EventualPropertyRetriever | undefined;

    if (retriever) {
      return getEventualProperty(
        property,
        retriever
      ) as EventualPropertyType<P>;
    }

    throw new Error(`Missing Property Retriever for ${property}`);
  }
}

export interface DefaultPropertyRetrieverDeps {
  bucketStore: BucketStore;
  openSearchClient: Client;
  serviceClient: EventualServiceClient;
}
