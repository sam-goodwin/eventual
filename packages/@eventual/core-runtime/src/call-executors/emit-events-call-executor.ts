import type { EmitEventsCall } from "@eventual/core/internal";
import type { CallExecutor } from "../call-executor.js";
import type { EventClient } from "../clients/event-client.js";

export class EmitEventsCallExecutor implements CallExecutor<EmitEventsCall> {
  constructor(private eventClient: EventClient) {}
  public async execute(call: EmitEventsCall): Promise<void> {
    await this.eventClient.emitEvents(...call.events);
  }
}
