import { EventEnvelope, ServiceContext } from "@eventual/core";
import { ServiceType } from "@eventual/core/internal";
import { SubscriptionProvider } from "../providers/subscription-provider.js";
import { getLazy } from "../utils.js";
import { WorkerIntrinsicDeps, createEventualWorker } from "./worker.js";

/**
 * The dependencies of {@link createSubscriptionWorker}.
 */
export interface EventHandlerDependencies extends WorkerIntrinsicDeps {
  /**
   * Returns event handlers
   */
  subscriptionProvider: SubscriptionProvider;
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
export function createSubscriptionWorker(
  deps: EventHandlerDependencies
): SubscriptionWorker {
  const serviceContext: ServiceContext = {
    serviceName: getLazy(deps.serviceName),
    serviceUrl: getLazy(deps.serviceUrl),
  };
  return createEventualWorker(
    { serviceType: ServiceType.Subscription, ...deps },
    async (events) => {
      await Promise.allSettled(
        events.map((event) =>
          Promise.allSettled(
            deps.subscriptionProvider
              .getSubscriptionsForEvent(event.name)
              .map((handler) =>
                handler(event.event, {
                  service: serviceContext,
                })
              )
          )
        )
      );
    }
  );
}
