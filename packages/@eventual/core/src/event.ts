import { createWaitForEventCall } from "./calls/wait-for-event-call.js";

class Event<Payload = void> {
  constructor(public readonly id: string) {}
  on(_handler: (payload: Payload) => Promise<void> | void): Promise<void> {
    throw new Error("Not implemented");
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
