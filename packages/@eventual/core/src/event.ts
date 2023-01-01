import { createPublishEventsCall } from "./calls/send-events-call.js";
import { events, eventSubscriptions } from "./global.js";
import { getServiceClient, isOrchestratorWorker } from "./index.js";

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
 * may be {@link publish}ed and {@link on}d to.
 */
export interface Event<E extends EventPayload = EventPayload> {
  /**
   * The Event's globally unique name.
   */
  readonly name: string;
  /**
   * Subscribe to this event. The {@link handler} will be invoked every
   * time an event with this name is published within the service boundary.
   *
   * @param handler the handler function that will process the event.
   */
  on(handler: (event: E) => Promise<void>): void;
  /**
   * Publish events of this type within the service boundary.
   *
   * @param events a list of events to publish.
   */
  publish(...events: E[]): Promise<void>;
}

/**
 * A {@link Subscription} is an object that describes how to select events from
 * within a service boundary to route to a {@link EventHandler}.
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
   * The {@link EventHandler} to invoke for any event that matches one of
   * the {@link subscriptions}.
   */
  handler: EventHandler<E>;
}

/**
 * A Function that processes an {@link event} of type {@link E}.
 */
export type EventHandler<E extends EventPayload> = (event: E) => Promise<void>;

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
 *   await checkoutEvent.publish({
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
 * checkoutEvent.on(async (checkout) => {
 *   console.log(checkout);
 * });
 * ```
 *
 * @param name a unique name that identifies this event type within the Service.
 * @returns an {@link Event}
 */
export function event<E extends EventPayload>(name: string): Event<E> {
  if (events().has(name)) {
    throw new Error(`event with name '${name}' already exists`);
  }
  const event: Event<E> = {
    name,
    on(handler) {
      eventSubscriptions().push({
        subscriptions: [
          {
            name,
          },
        ],
        handler: handler as EventHandler<EventPayload>,
      });
    },
    publish(...events) {
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
  events().set(name, event);
  return event;
}
