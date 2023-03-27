import { EventEnvelope, EventualServiceClient } from "@eventual/core";
import {
  registerDictionaryHook,
  registerServiceClient,
  ServiceType,
  serviceTypeScope,
} from "@eventual/core/internal";
import { DictionaryClient } from "../clients/dictionary-client.js";
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
  dictionaryClient: DictionaryClient;
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
  dictionaryClient,
}: EventHandlerDependencies): SubscriptionWorker {
  // make the workflow client available to web hooks
  if (serviceClient) {
    registerServiceClient(serviceClient);
  }
  registerDictionaryHook(dictionaryClient);

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
