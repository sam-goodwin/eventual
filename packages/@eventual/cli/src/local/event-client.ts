import { EventEnvelope, EventPayload } from "@eventual/core";
import { EventClient, SubscriptionWorker } from "@eventual/core-runtime";

export class LocalEventClient implements EventClient {
  constructor(private eventHandlerWorker: SubscriptionWorker) {}

  publishEvents(...events: EventEnvelope<EventPayload>[]): Promise<void> {
    return this.eventHandlerWorker(events);
  }
}
