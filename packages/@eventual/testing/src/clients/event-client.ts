import { EventEnvelope, EventPayload } from "@eventual/core";
import { EventClient, EventHandlerWorker } from "@eventual/core-runtime";

export class TestEventClient implements EventClient {
  constructor(private eventHandlerWorker: EventHandlerWorker) {}

  public async publishEvents(
    ...event: EventEnvelope<EventPayload>[]
  ): Promise<void> {
    return await this.eventHandlerWorker(event);
  }
}
