import {
  EventualCallKind,
  EventualCallSymbol,
  EventualProperty,
  EventualPropertyKind,
  EventualPropertySymbol,
  type EventualCall,
  type EventualHook,
  type EventualPromise,
  type EventualPropertyType,
  type Result,
} from "@eventual/core/internal";
import {
  EventualCallExecutorCollection,
  EventualExecutor,
  EventualPropertyRetriever,
  EventualPropertyRetrieverCollection,
  getEventualProperty,
} from "./eventual-hook.js";

export class DefaultEventualHook implements EventualHook {
  constructor(
    private executors: EventualCallExecutorCollection,
    private propertyRetrievers: EventualPropertyRetrieverCollection
  ) {}

  public executeEventualCall(eventual: EventualCall): EventualPromise<any> {
    const kind = eventual[EventualCallSymbol];
    const executor = this.executors[
      EventualCallKind[kind] as keyof typeof EventualCallKind
    ] as EventualExecutor | undefined;

    if (executor) {
      return executor.execute(eventual) as unknown as EventualPromise<any>;
    }

    throw new Error(`Missing Executor for ${EventualCallKind[kind]}`);
  }

  public getEventualProperty<P extends EventualProperty = EventualProperty>(
    property: P
  ): EventualPropertyType<P> {
    const retriever = this.propertyRetrievers[
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

  public resolveEventual(_seq: number, _result: Result<any>): void {
    throw new Error(
      "Resolve Eventual is not supported outside of a workflow or transaction."
    );
  }
}
