import type { EmitEventsCall } from "@eventual/core/internal";
import type { EventClient } from "../clients/event-client.js";
import { CallExecutor } from "../eventual-hook.js";

export class EmitEventsCallExecutor implements CallExecutor<EmitEventsCall> {
  constructor(private eventClient: EventClient) {}
  public async execute(call: EmitEventsCall): Promise<void> {
    await this.eventClient.emitEvents(...call.events);
  }
}
