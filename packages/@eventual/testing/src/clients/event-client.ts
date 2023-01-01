import {
  EventClient,
  EventEnvelope,
  EventHandlerWorker,
  EventPayload,
  ServiceType,
} from "@eventual/core";
import { serviceTypeScope } from "../utils.js";

export class TestEventClient implements EventClient {
  constructor(private eventHandlerWorker: EventHandlerWorker) {}

  public async publishEvents(
    ...event: EventEnvelope<EventPayload>[]
  ): Promise<void> {
    return serviceTypeScope(ServiceType.EventHandler, async () => {
      await this.eventHandlerWorker(event);
    });
  }
}
