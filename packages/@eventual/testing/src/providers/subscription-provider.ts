import { Event, SubscriptionHandler, EventPayloadType } from "@eventual/core";
import { GlobalSubscriptionProvider } from "@eventual/runtime-core";

export class TestSubscriptionProvider extends GlobalSubscriptionProvider {
  private defaultHandlersDisabled = false;
  private testHandlers: Record<string, SubscriptionHandler<any>[]> = {};

  /**
   * Disables all subscribes made on the service outside of the test environment.
   */
  public disableDefaultSubscriptions() {
    this.defaultHandlersDisabled = true;
  }

  /**
   * Turns on all subscriptions mde on the service outside of the test environment.
   */
  public enableDefaultSubscriptions() {
    this.defaultHandlersDisabled = false;
  }

  public clearTestHandlers() {
    this.testHandlers = {};
  }

  public subscribeEvents<E extends Event>(
    events: E[],
    handler: SubscriptionHandler<EventPayloadType<E>>
  ) {
    for (const event of events) {
      if (!(event.name in this.testHandlers)) {
        this.testHandlers[event.name] = [];
      }
      this.testHandlers[event.name]?.push(handler);
    }
  }

  public override getSubscriptionsForEvent(
    eventId: string
  ): SubscriptionHandler<any>[] {
    const defaultHandlers = this.defaultHandlersDisabled
      ? []
      : super.getSubscriptionsForEvent(eventId);

    const testHandlers = this.testHandlers[eventId] ?? [];

    return [...defaultHandlers, ...testHandlers];
  }
}
