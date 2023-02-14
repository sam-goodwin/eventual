import { Event, EventHandlerFunction, EventPayloadType } from "@eventual/core";
import { GlobalEventHandlerProvider } from "@eventual/core-runtime";

export class TestEventHandlerProvider extends GlobalEventHandlerProvider {
  private defaultHandlersDisabled = false;
  private testHandlers: Record<string, EventHandlerFunction<any>[]> = {};

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

  public subscribeEvent<E extends Event>(
    event: E,
    handler: EventHandlerFunction<EventPayloadType<E>>
  ) {
    if (!(event.name in this.testHandlers)) {
      this.testHandlers[event.name] = [];
    }
    this.testHandlers[event.name]?.push(handler);
  }

  public override getEventHandlersForEvent(
    eventId: string
  ): EventHandlerFunction<any>[] {
    const defaultHandlers = this.defaultHandlersDisabled
      ? []
      : super.getEventHandlersForEvent(eventId);

    const testHandlers = this.testHandlers[eventId] ?? [];

    return [...defaultHandlers, ...testHandlers];
  }
}
