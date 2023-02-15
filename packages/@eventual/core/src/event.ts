import type z from "zod";
import { createPublishEventsCall } from "./internal/calls/send-events-call.js";
import { isOrchestratorWorker } from "./internal/flags.js";
import type { FunctionRuntimeProps } from "./function-props.js";
import { eventHandlers, events, getServiceClient } from "./internal/global.js";
import { isSourceLocation, SourceLocation } from "./internal/service-spec.js";

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
 * Runtime Props for an Event Handler.
 */
export interface EventHandlerRuntimeProps extends FunctionRuntimeProps {
  /**
   * Number of times an event can be re-driven to the Event Handler before considering
   * the Event as failed to process and sending it to the Service Dead Letter Queue.
   *
   * Minimum value of `0`.
   * Maximum value of `185`.
   *
   * @default 185
   */
  retryAttempts?: number;
}

/**
 * An {@link Event} is an object representing the declaration of an event
 * that belongs within the service. An {@link Event} has a unique {@link name},
 * may be {@link publishEvents}ed and {@link onEvent}d to.
 */
export interface Event<E extends EventPayload = EventPayload> {
  kind: "Event";
  /**
   * The Event's globally unique name.
   */
  readonly name: string;
  /**
   * An optional Schema of the Event.
   */
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
  ): EventHandler<Name, E>;
  onEvent<Name extends string>(
    name: Name,
    props: EventHandlerRuntimeProps,
    handlers: EventHandlerFunction<E>
  ): EventHandler<Name, E>;
  /**
   * Publish events of this type within the service boundary.
   *
   * @param events a list of events to publish.
   */
  publishEvents(...events: E[]): Promise<void>;
}

export interface EventHandler<
  Name extends string = string,
  E extends EventPayload = EventPayload
> {
  kind: "EventHandler";
  name: Name;
  /**
   * The Handler Function for processing the Events.
   */
  handler: EventHandlerFunction<E>;
  /**
   * Subscriptions this Event Handler is subscribed to. Any event flowing
   * through the Service's Event Bus that match these criteria will be
   * sent to this Lambda Function.
   */
  subscriptions: Subscription[];
  /**
   * Runtime configuration for this Event Handler.
   */
  runtimeProps?: EventHandlerRuntimeProps;
  /**
   * Only available during eventual-infer.
   */
  sourceLocation?: SourceLocation;
}

/**
 * A {@link Subscription} is an object that describes how to select events from
 * within a service boundary to route to a {@link EventHandlerFunction}.
 *
 * For now, we only support matching on a single name, but this object can be
 * extended with other properties such as selection predicates.
 */
export interface Subscription {
  /**
   * Name of the event to subscribe to.
   */
  name: string;
}

/**
 * An {@link EventSubscription} is an object that associates a {@link handler}
 * function with a list of {@link subscriptions}. The {@link subscriptions}
 * define which events this {@link handler} should be invoked for.
 */
export interface EventSubscription<E extends EventPayload = EventPayload> {
  /**
   * A list of {@link Subscription}s that should invoke this {@link handler}.
   */
  subscriptions: Subscription[];
  /**
   * The {@link EventHandlerFunction} to invoke for any event that matches one of
   * the {@link subscriptions}.
   */
  handler: EventHandlerFunction<E>;
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

      const eventHandler: EventHandler<Name, E> = {
        kind: "EventHandler",
        name,
        handler,
        subscriptions: [
          {
            name: event.name,
          },
        ],
        runtimeProps: eventHandlerProps,
        sourceLocation,
      };

      eventHandlers().push(eventHandler as EventHandler<any, any>);

      return eventHandler;
    },
    async publishEvents(...events) {
      const envelopes = events.map((event) => ({
        name,
        event,
      }));
      if (isOrchestratorWorker()) {
        return createPublishEventsCall(envelopes) as any;
      } else {
        return getServiceClient().publishEvents({ events: envelopes });
      }
    },
  };
  events().set(name, event as Event<any>);
  return event;
}
