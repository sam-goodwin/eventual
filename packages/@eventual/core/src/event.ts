import type { z } from "zod";
import {
  createEventualCall,
  EventualCallKind,
} from "./internal/calls/calls.js";
import { getEventualCallHook } from "./internal/eventual-hook.js";
import { events, getServiceClient, subscriptions } from "./internal/global.js";
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
 * may be {@link publishEvents}ed and {@link onEvent}d to.
 */
export interface Event<E extends EventPayload = EventPayload>
  extends Omit<EventSpec, "schema"> {
  kind: "Event";
  schema?: z.Schema<E>;
  /**
   * Subscribe to this event. The {@link handler} will be invoked every
   * time an event with this name is published within the service boundary.
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
   * Publish events of this type within the service boundary.
   *
   * @param events a list of events to publish.
   */
  publishEvents(...events: E[]): Promise<void>;
}

/**
 * A Function that processes an {@link event} of type {@link E}.
 */
export type EventHandlerFunction<E extends EventPayload> = (
  event: E
) => Promise<void>;

/**
 * Declares an event that can be published and subscribed to.
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
 * To publish events, call the `publish` method:
 * ```ts
 * const checkoutWorkflow = workflow("checkoutWorkflow", async (request) => {
 *   await checkoutEvent.publishEvents({
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
  if (events().has(name)) {
    throw new Error(`event with name '${name}' already exists`);
  }
  const event: Event<E> = {
    kind: "Event",
    name,
    schema,
    onEvent<Name extends string>(...args: any[]) {
      // we have an implicit contract where the SourceLocation may be passed in as the first argument
      const [sourceLocation, name, eventHandlerProps, handler] = [
        args.find(isSourceLocation)!,
        args.find((a) => typeof a === "string") as Name,
        args.find((a) => typeof a === "object" && !isSourceLocation(a))!,
        args.find((a) => typeof a === "function"),
      ];

      const eventHandler: Subscription<Name, E> = {
        kind: "Subscription",
        name,
        handler,
        filters: [{ name: event.name }],
        props: eventHandlerProps,
        sourceLocation,
      };

      subscriptions().push(eventHandler as Subscription<any, any>);

      return eventHandler;
    },
    async publishEvents(...events) {
      const envelopes = events.map((event) => ({
        name,
        event,
      }));
      return getEventualCallHook().registerEventualCall(
        createEventualCall(EventualCallKind.PublishEventsCall, {
          events: envelopes,
        }),
        () => {
          return getServiceClient().publishEvents({ events: envelopes });
        }
      );
    },
  };
  events().set(name, event as Event<any>);
  return event;
}
