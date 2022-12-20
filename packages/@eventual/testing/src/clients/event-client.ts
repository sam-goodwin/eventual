import { EventClient, EventEnvelope, EventPayload } from "@eventual/core";

export class TestEventClient implements EventClient {
  publish(..._event: EventEnvelope<EventPayload>[]): Promise<void> {
    // TODO: implement me
    throw new Error("Method not implemented.");
  }
}