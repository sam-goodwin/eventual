import {
  EventClient,
  EventEnvelope,
  EventHandlerWorker,
  EventPayload,
  registerEventClient,
  ServiceType,
} from "@eventual/core";
import { serviceTypeScope } from "../utils.js";

export class TestEventClient implements EventClient {
  constructor(private eventHandlerWorker: EventHandlerWorker) {}

  public async publish(...event: EventEnvelope<EventPayload>[]): Promise<void> {
    return serviceTypeScope(ServiceType.EventHandler, async () => {
      // TODO: unregister - can we do better than this global.
      registerEventClient(this);
      await this.eventHandlerWorker(event);
    });
  }
}
