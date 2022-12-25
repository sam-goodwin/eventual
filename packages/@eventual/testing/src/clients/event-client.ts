import { EventClient, EventEnvelope, EventPayload } from "@eventual/core";
import { EventHandlerController } from "../event-handler-controller.js";

export class TestEventClient implements EventClient {
  constructor(private eventHandlerController: EventHandlerController) {}

  async publish(...event: EventEnvelope<EventPayload>[]): Promise<void> {
    await Promise.allSettled(
      event.map((e) => this.eventHandlerController.receiveEvent(e))
    );
  }
}
