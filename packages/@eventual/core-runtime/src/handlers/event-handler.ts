import { EventEnvelope, EventualServiceClient } from "@eventual/core";
import {
  registerServiceClient,
  ServiceType,
  serviceTypeScope,
} from "@eventual/core/internal";
import { SubscriptionProvider } from "../providers/subscription-provider.js";

/**
 * The dependencies of {@link createEventHandlerWorker}.
 */
export interface EventHandlerDependencies {
  /**
   * The {@link EventualServiceClient} for interacting with workflows contained
   * within the service boundary.
   */
  serviceClient?: EventualServiceClient;
  /**
   * Returns event handlers
   */
  eventHandlerProvider: SubscriptionProvider;
}

export interface EventHandlerWorker {
  (events: EventEnvelope[]): Promise<void>;
}

/**
 * Creates a generic function for handling inbound event requests
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createEventHandlerWorker({
  serviceClient,
  eventHandlerProvider,
}: EventHandlerDependencies): EventHandlerWorker {
  // make the workflow client available to web hooks
  if (serviceClient) {
    registerServiceClient(serviceClient);
  }

  return async function (events) {
    return await serviceTypeScope(ServiceType.Subscription, async () => {
      await Promise.allSettled(
        events.map((event) =>
          Promise.allSettled(
            eventHandlerProvider
              .getSubscriptionsForEvent(event.name)
              .map((handler) => handler(event.event))
          )
        )
      );
    });
  };
}
