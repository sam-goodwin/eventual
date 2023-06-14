import type { Event, EventPayload } from "./event.js";
import type { FunctionRuntimeProps } from "./function-props.js";
import { registerEventualResource } from "./internal/global.js";
import { isSourceLocation, SourceLocation } from "./internal/service-spec.js";
import { ServiceContext } from "./service.js";

export interface SubscriptionContext {
  /**
   *Information about the containing service.
   */
  service: ServiceContext;
}

/**
 * A Function that processes an {@link event} of type {@link E}.
 */
export type SubscriptionHandler<E extends EventPayload> = (
  event: E,
  context: SubscriptionContext
) => Promise<void> | void;

/**
 * Runtime Props for an Event Handler.
 */
export interface SubscriptionRuntimeProps extends FunctionRuntimeProps {
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

export interface SubscriptionProps<E extends EventPayload>
  extends SubscriptionRuntimeProps {
  /**
   * Events to subscribe to.
   */
  events: Event<E>[];
}

export interface Subscription<
  Name extends string = string,
  E extends EventPayload = EventPayload
> {
  kind: "Subscription";
  /**
   * Unique name of this Subscription.
   */
  name: Name;
  /**
   * The Handler Function for processing the Events.
   */
  handler: SubscriptionHandler<E>;
  /**
   * Subscriptions this Event Handler is subscribed to. Any event flowing
   * through the Service's Event Bus that match these criteria will be
   * sent to this Lambda Function.
   */
  filters: SubscriptionFilter[];
  /**
   * Runtime configuration for this Event Handler.
   */
  props?: SubscriptionProps<E>;
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
export interface SubscriptionFilter {
  /**
   * Name of the event to subscribe to.
   */
  name: string;
}

/**
 * Subscribe to this event. The {@link handler} will be invoked every
 * time an event with this name is emitted within the service boundary.
 *
 * @param handler the handler function that will process the event.
 */
export function subscription<Name extends string, E extends EventPayload>(
  name: Name,
  props: SubscriptionProps<E>,
  handlers: SubscriptionHandler<E>
): Subscription<Name, E>;

export function subscription<Name extends string, E extends EventPayload>(
  ...args: any[]
) {
  // we have an implicit contract where the SourceLocation may be passed in as the first argument
  const [sourceLocation, name, props, handler] = [
    args.find(isSourceLocation)!,
    args.find((a) => typeof a === "string") as Name,
    args.find(
      (a): a is SubscriptionProps<E> =>
        typeof a === "object" && !isSourceLocation(a)
    )!,
    args.find((a) => typeof a === "function"),
  ];

  if (props.events.length === 0) {
    throw new Error(`subscription must provide at least event to match`);
  }

  return registerEventualResource("subscriptions", name, {
    kind: "Subscription",
    name,
    handler,
    filters: props.events.map((event) => ({
      name: event.name,
    })),
    props,
    sourceLocation,
  });
}
