import { createRegisterEventHandlerCall } from "./calls/event-handler-call.js";
import { createWaitForEventCall } from "./calls/wait-for-event-call.js";

/**
 * A reference to a created event handler.
 */
export interface EventHandler {
  /**
   * Remove the handler from the event.
   *
   * Any ongoing {@link Chain}s started by the handler will continue to run to completion.
   */
  dispose: () => void;
}

export type EventHandlerFunction<Payload = void> = (
  payload: Payload
) => Promise<void> | void;

export class Event<Payload = void> {
  constructor(public readonly id: string) {}
  /**
   * Listens for events sent to the current workflow.
   *
   * When the event is received, the handler is invoked.
   * If the handler return a promise, the handler is added a {@link Chain}
   * and progressed until completion.
   *
   * ```ts
   * const myEvent = new Event("MyEvent");
   *
   * workflow("wf", () => {
   *    let done = false;
   *    myEvent.on(async () => {
   *       await sleepFor(10);
   *       done = true;
   *    });
   *
   *    await condition(() => done);
   * });
   * ```
   *
   * To remove the handler, call the dispose method.
   *
   * ```ts
   * const handler = myEvent.on(() => {});
   *
   * await sleepFor(10);
   *
   * handler.dispose();
   * ```   */
  on(handler: EventHandlerFunction<Payload>): EventHandler {
    return onEvent(this, handler);
  }
  /**
   * Waits for an event to be received by the workflow.
   *
   * The first event received will resolve the Promise with the payload of the promise.
   *
   * ```ts
   * const myEvent = new Event<string>("MyEvent");
   * workflow("wf", async () => {
   *    const payload = await myEvent.waitFor();
   *
   *    return payload;
   * });
   * ```
   *
   * Use `opts.timeoutSeconds` to stop waiting after the provided time. The Promise will reject
   * when the provided time has elapsed.
   *
   * ```ts
   * const myEvent = new Event<string>("MyEvent");
   * workflow("wf", async () => {
   *    try {
   *       const payload = await myEvent.waitFor({ timeoutSecond: 10 * 60 });
   *
   *       return payload;
   *    } catch {
   *       return "nothing!";
   *    }
   * });
   * ```
   */
  waitFor(opts?: WaitForEventOpts): Promise<Payload> {
    return waitForEvent(this, opts);
  }
}

export type EventPayload<E extends Event<any>> = E extends Event<infer P>
  ? P
  : never;

export interface WaitForEventOpts {
  /**
   * Optional. Seconds to wait for the event to be received.
   *
   * After the provided seconds, the promise will reject.
   */
  timeoutSeconds: number;
}

/**
 * Waits for an event to be received by the workflow.
 *
 * The first event received will resolve the Promise with the payload of the promise.
 *
 * ```ts
 * workflow("wf", () => {
 *    const payload = await waitForEvent("MyEvent");
 *
 *    return payload;
 * });
 * ```
 *
 * Use `opts.timeoutSeconds` to stop waiting after the provided time. The Promise will reject
 * when the provided time has elapsed.
 */
export function waitForEvent<EventPayload = any>(
  eventId: string,
  opts?: WaitForEventOpts
): Promise<EventPayload>;
export function waitForEvent<E extends Event<any>>(
  event: E,
  opts?: WaitForEventOpts
): Promise<EventPayload<E>>;
export function waitForEvent(
  event: Event<any> | string,
  opts?: WaitForEventOpts
): Promise<EventPayload<any>> {
  return createWaitForEventCall(
    typeof event === "string" ? event : event.id,
    opts?.timeoutSeconds
  ) as any;
}

/**
 * Listens for an event matching the eventId provided.
 *
 * When the event is received, the handler is invoked.
 * If the handler return a promise, the handler is added as a {@link Chain}
 * and progressed until completion.
 *
 * ```ts
 * workflow("wf", () => {
 *    let done = false;
 *    onEvent("MyEvent", async () => {
 *       await sleepFor(10);
 *       done = true;
 *    });
 *
 *    await condition(() => done);
 * });
 * ```
 *
 * To remove the handler, call the dispose method.
 *
 * ```ts
 * const handler = onEvent("MyEvent", () => {});
 *
 * await sleepFor(10);
 *
 * handler.dispose();
 * ```
 */
export function onEvent<E extends Event<any>>(
  event: E,
  handler: EventHandlerFunction<EventPayload<E>>
): EventHandler;
export function onEvent<Payload = void>(
  eventId: string,
  handler: EventHandlerFunction<Payload>
): EventHandler;
export function onEvent(
  event: Event<any> | string,
  handler: EventHandlerFunction<any>
): EventHandler {
  return createRegisterEventHandlerCall(
    typeof event === "string" ? event : event.id,
    handler as any
  );
}
