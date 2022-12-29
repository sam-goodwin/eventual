import { EventHandler, EventPayload, EventSubscription } from "../../event.js";
import { eventSubscriptions } from "../../global.js";

export interface EventHandlerProvider {
  getEventHandlersForEvent(eventId: string): EventHandler<any>[];
}

export class GlobalEventHandlerProvider implements EventHandlerProvider {
  private readonly subscriptions: Record<string, EventHandler<EventPayload>[]>;
  constructor() {
    this.subscriptions = indexEventSubscriptions(eventSubscriptions());
  }

  public getEventHandlersForEvent(eventId: string): EventHandler<any>[] {
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
    .reduce<Record<string, EventHandler<EventPayload>[]>>(
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
