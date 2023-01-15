import {
  EventClient,
  EventEnvelope,
  EventHandlerWorker,
  EventPayload,
} from "@eventual/core";

export class TestEventClient implements EventClient {
  constructor(private eventHandlerWorker: EventHandlerWorker) {}

  public async publishEvents(
    ...event: EventEnvelope<EventPayload>[]
  ): Promise<void> {
    return await this.eventHandlerWorker(event);
  }
}
