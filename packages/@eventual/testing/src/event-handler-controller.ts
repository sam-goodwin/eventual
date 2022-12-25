import {
  Event,
  EventEnvelope,
  EventHandler,
  EventPayload,
  EventPayloadType,
  eventSubscriptions,
  ServiceType,
} from "@eventual/core";
import { serviceTypeScope } from "./utils.js";

/**
 * Abstraction which wraps the normal service event handlers and
 * allows disabling them, overriding them, or providing new handlers in the context
 * of the test environment.
 */
export class EventHandlerController {
  private defaultHandlersDisabled: boolean = false;
  private testHandlers: Record<string, EventHandler<any>[]> = {};
  private readonly defaultHandlers: Record<string, EventHandler<any>[]>;

  constructor() {
    this.defaultHandlers = eventSubscriptions().reduce(
      (_events: Record<string, EventHandler<any>[]>, subscription) => {
        return subscription.subscriptions.reduce(
          (events, { name }) => ({
            ...events,
            [name]: [...(events[name] ?? []), subscription.handler],
          }),
          _events
        );
      },
      {}
    );
  }
  /**
   * Disables all subscribes made on the service outside of the test environment.
   */
  disableDefaultSubscriptions() {
    this.defaultHandlersDisabled = true;
  }

  /**
   * Turns on all subscriptions mde on the service outside of the test environment.
   */
  enableDefaultSubscriptions() {
    this.defaultHandlersDisabled = false;
  }

  clearTestHandlers() {
    this.testHandlers = {};
  }

  subscribeEvent<E extends Event>(
    event: E,
    handler: EventHandler<EventPayloadType<E>>
  ) {
    if (!(event.name in this.testHandlers)) {
      this.testHandlers[event.name] = [];
    }
    this.testHandlers[event.name]?.push(handler);
  }

  async receiveEvent(event: EventEnvelope<EventPayload>) {
    const defaultHandlers = this.defaultHandlersDisabled
      ? []
      : this.defaultHandlers[event.name] ?? [];
    const testHandlers = this.testHandlers[event.name] ?? [];

    const handlers = [...defaultHandlers, ...testHandlers];

    await serviceTypeScope(ServiceType.EventHandler, () =>
      Promise.allSettled(handlers.map((h) => h(event.event)))
    );
  }
}
