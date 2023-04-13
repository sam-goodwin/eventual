import { EventEnvelope, EventualServiceClient } from "@eventual/core";
import {
  registerEntityHook,
  registerServiceClient,
  registerServiceSpecification,
  ServiceSpec,
  ServiceType,
  serviceTypeScope,
} from "@eventual/core/internal";
import { EntityClient } from "../clients/entity-client.js";
import { SubscriptionProvider } from "../providers/subscription-provider.js";

/**
 * The dependencies of {@link createSubscriptionWorker}.
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
  subscriptionProvider: SubscriptionProvider;
  entityClient: EntityClient;
  serviceSpec?: ServiceSpec;
}

export interface SubscriptionWorker {
  (events: EventEnvelope[]): Promise<void>;
}

/**
 * Creates a generic function for handling inbound event requests
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createSubscriptionWorker({
  serviceClient,
  subscriptionProvider: eventHandlerProvider,
  entityClient,
  serviceSpec,
}: EventHandlerDependencies): SubscriptionWorker {
  // make the workflow client available to web hooks
  if (serviceClient) {
    registerServiceClient(serviceClient);
  }
  registerEntityHook(entityClient);
  if (serviceSpec) {
    registerServiceSpecification(serviceSpec);
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
