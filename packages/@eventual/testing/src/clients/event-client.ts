import { EventEnvelope } from "@eventual/core";
import { EventClient, SubscriptionWorker } from "@eventual/core-runtime";

export class TestEventClient implements EventClient {
  constructor(private eventHandlerWorker: SubscriptionWorker) {}

  public async publishEvents(...event: EventEnvelope[]): Promise<void> {
    return await this.eventHandlerWorker(event);
  }
}
