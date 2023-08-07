import type {
  EventualCall,
  EventualCallOutput,
  EventualHook,
  EventualPromise,
  EventualProperty,
  EventualPropertyType,
  Result,
} from "@eventual/core/internal";
import {
  AnyEventualCallExecutor,
  AnyPropertyRetriever,
  type EventualCallExecutorCollection,
  type EventualPropertyRetrieverCollection,
} from "./eventual-hook.js";

export class DefaultEventualHook implements EventualHook {
  constructor(
    private executors: EventualCallExecutorCollection,
    private propertyRetrievers: EventualPropertyRetrieverCollection
  ) {}

  public executeEventualCall<P extends EventualCall>(
    eventual: P
  ): EventualPromise<any> {
    return new AnyEventualCallExecutor(this.executors).execute(
      eventual
    ) as EventualCallOutput<P>;
  }

  public getEventualProperty<P extends EventualProperty = EventualProperty>(
    property: P
  ): EventualPropertyType<P> {
    return new AnyPropertyRetriever(this.propertyRetrievers).getProperty<P>(
      property
    ) as EventualPropertyType<P>;
  }

  public resolveEventual(_seq: number, _result: Result<any>): void {
    throw new Error(
      "Resolve Eventual is not supported outside of a workflow or transaction."
    );
  }
}
