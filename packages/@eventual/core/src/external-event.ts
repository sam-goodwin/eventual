import { createRegisterEventHandlerCall } from "./calls/event-handler-call.js";
import { createWaitForEventCall } from "./calls/wait-for-event-call.js";

export interface EventHandler {
  dispose: () => void;
}

export class Event<Payload = void> {
  constructor(public readonly id: string) {}
  on(handler: (payload: Payload) => Promise<void> | void): EventHandler {
    return createRegisterEventHandlerCall(this.id, handler as any);
  }
}

export type EventPayload<E extends Event<any>> = E extends Event<infer P>
  ? P
  : never;

export function waitForEvent<EventPayload = any>(
  eventId: string,
  opts?: { timeoutSeconds: number }
): Promise<EventPayload>;
export function waitForEvent<E extends Event<any>>(
  event: E,
  opts?: { timeoutSeconds: number }
): Promise<EventPayload<E>>;
export function waitForEvent<E extends Event<any>>(
  event: E | string,
  opts?: { timeoutSeconds: number }
): Promise<EventPayload<E>> {
  return createWaitForEventCall(
    typeof event === "string" ? event : event.id,
    opts?.timeoutSeconds
  ) as any;
}
