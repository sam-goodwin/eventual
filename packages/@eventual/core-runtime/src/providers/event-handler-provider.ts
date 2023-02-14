import {
  EventHandlerFunction,
  EventPayload,
  EventSubscription,
  eventHandlers,
} from "@eventual/core";

export interface EventHandlerProvider {
  getEventHandlersForEvent(eventId: string): EventHandlerFunction<any>[];
}

export class GlobalEventHandlerProvider implements EventHandlerProvider {
  private readonly subscriptions: Record<
    string,
    EventHandlerFunction<EventPayload>[]
  >;
  constructor() {
    this.subscriptions = indexEventSubscriptions(eventHandlers());
  }

  public getEventHandlersForEvent(
    eventId: string
  ): EventHandlerFunction<any>[] {
    return this.subscriptions[eventId] ?? [];
  }
}

/**
 * Create an index of Event Name to a list of all handler functions
 * subscribed to that event.
 */
function indexEventSubscriptions(
  subscriptions: EventSubscription<EventPayload>[]
) {
  return subscriptions
    .flatMap((e) =>
      e.subscriptions.map((sub) => [sub.name, e.handler] as const)
    )
    .reduce<Record<string, EventHandlerFunction<EventPayload>[]>>(
      (index, [name, handler]) => ({
        ...index,
        ...(name in index
          ? {
              [name]: [...index[name]!, handler],
            }
          : {
              [name]: [handler],
            }),
      }),
      {}
    );
}
