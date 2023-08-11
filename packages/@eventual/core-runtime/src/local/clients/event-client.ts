import { EventEnvelope } from "@eventual/core";
import { EventClient } from "../../clients/event-client.js";
import { LocalEnvConnector } from "../local-container.js";

export class LocalEventClient implements EventClient {
  constructor(private localConnector: LocalEnvConnector) {}

  public async emitEvents(...event: EventEnvelope[]): Promise<void> {
    this.localConnector.pushWorkflowTask({
      kind: "EmittedEvents",
      events: event,
    });
  }
}
