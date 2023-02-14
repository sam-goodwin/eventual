import {
  SubscriptionHandler,
  EventPayload,
  Subscription,
  subscriptions,
} from "@eventual/core";

export interface EventHandlerProvider {
  getEventHandlersForEvent(eventId: string): SubscriptionHandler<any>[];
}

export class GlobalEventHandlerProvider implements EventHandlerProvider {
  private readonly subscriptions: Record<
    string,
    SubscriptionHandler<EventPayload>[]
  >;
  constructor() {
    this.subscriptions = indexSubscriptions(subscriptions());
  }

  public getEventHandlersForEvent(eventId: string): SubscriptionHandler<any>[] {
    return this.subscriptions[eventId] ?? [];
  }
}

/**
 * Create an index of Event Name to a list of all handler functions
 * subscribed to that event.
 */
function indexSubscriptions(
  subscriptions: Subscription<string, EventPayload>[]
) {
  return subscriptions
    .flatMap((e) => e.filters.map((sub) => [sub.name, e.handler] as const))
    .reduce<Record<string, SubscriptionHandler<EventPayload>[]>>(
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
