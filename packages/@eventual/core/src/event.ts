import type { z } from "zod";
import { createEventualCall, EventualCallKind } from "./internal/calls.js";
import {
  getServiceClient,
  registerEventualResource,
} from "./internal/global.js";
import { EventSpec, isSourceLocation } from "./internal/service-spec.js";
import type { Subscription, SubscriptionRuntimeProps } from "./subscription.js";

/**
 * An EventPayload is the data sent as an event.
 *
 * It must be an object. Properties can be any type serializable as JSON.
 */
export interface EventPayload {
  [propName: string]: any;
}

export type EventPayloadType<E extends Event<any>> = E extends Event<
  infer Payload
>
  ? Payload
  : never;

/**
 * An envelope object containing the {@link event} payload associated
 * with its unique {@link name}.
 *
 * This envelope decouples the {@link name} fro the payload so that
 * there are no impositions on the structure of an event.
 */
export interface EventEnvelope<E extends EventPayload = EventPayload> {
  /**
   * Unique name identifying the type of the {@link event}.
   */
  name: string;
  /**
   * The {@link EventPayload}.
   */
  event: E;
}

/**
 * An {@link Event} is an object representing the declaration of an event
 * that belongs within the service. An {@link Event} has a unique {@link name},
 * may be {@link emit}ed and {@link onEvent}d to.
 */
export interface Event<E extends EventPayload = EventPayload>
  extends Omit<EventSpec, "schema"> {
  kind: "Event";
  schema?: z.Schema<E>;
  /**
   * Subscribe to this event. The {@link handler} will be invoked every
   * time an event with this name is emitted within the service boundary.
   *
   * @param handler the handler function that will process the event.
   */
  onEvent<Name extends string>(
    name: Name,
    handler: EventHandlerFunction<E>
  ): Subscription<Name, E>;
  onEvent<Name extends string>(
    name: Name,
    props: SubscriptionRuntimeProps,
    handlers: EventHandlerFunction<E>
  ): Subscription<Name, E>;
  /**
   * Emit events of this type within the service boundary.
   *
   * @param events a list of events to emit.
   */
  emit(...events: E[]): Promise<void>;
}

/**
 * A Function that processes an {@link event} of type {@link E}.
 */
export type EventHandlerFunction<E extends EventPayload> = (
  event: E
) => Promise<void>;

/**
 * Declares an event that can be emitted and subscribed to.
 *
 * To declare an {@link Event}, define an interface describing the type
 * of the payload and then declare an event object giving it a unique name.
 * ```ts
 * interface CheckoutEvent {
 *   customerId: string;
 *   cartId: string;
 *   timestamp: string;
 * }
 *
 * const checkoutEvent = event<CheckoutEvent>("Checkout");
 * ```
 *
 * To emit events, call the `emit` method:
 * ```ts
 * const checkoutWorkflow = workflow("checkoutWorkflow", async (request) => {
 *   await checkoutEvent.emit({
 *     customerId: request.customerId,
 *     cartId: request.cartId,
 *     timestamp: new Date().toTimeString()
 *   });
 * })
 * ```
 *
 * To subscribe to events, call the `on` method. This will register a
 * handler that wil lbe invoked for every event of this type that is received.
 *
 * ```ts
 * checkoutEvent.onEvent("onCheckoutEvent", async (checkout) => {
 *   console.log(checkout);
 * });
 * ```
 *
 * @param name a unique name that identifies this event type within the Service.
 * @param schema an optional zod schema describing the allowed data.
 * @returns an {@link Event}
 */
export function event<E extends EventPayload>(
  name: string,
  schema?: z.Schema<E>
): Event<E> {
  return registerEventualResource("events", {
    kind: "Event",
    name,
    schema,
    onEvent<Name extends string>(...args: any[]) {
      // we have an implicit contract where the SourceLocation may be passed in as the first argument
      const [sourceLocation, subName, eventHandlerProps, handler] = [
        args.find(isSourceLocation)!,
        args.find((a) => typeof a === "string") as Name,
        args.find((a) => typeof a === "object" && !isSourceLocation(a))!,
        args.find((a) => typeof a === "function"),
      ];

      return registerEventualResource("subscriptions", {
        kind: "Subscription" as const,
        name: subName,
        handler,
        filters: [{ name }],
        props: eventHandlerProps,
        sourceLocation,
      });
    },
    async emit(...events) {
      const envelopes = events.map((event) => ({
        name,
        event,
      }));
      return getEventualCallHook().registerEventualCall(
        createEventualCall(EventualCallKind.EmitEventsCall, {
          events: envelopes,
        }),
        () => {
          return getServiceClient().emitEvents({ events: envelopes });
        }
      );
    },
  });
}
