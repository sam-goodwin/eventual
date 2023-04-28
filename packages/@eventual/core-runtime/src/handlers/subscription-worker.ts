import { EventEnvelope } from "@eventual/core";
import { ServiceType, serviceTypeScope } from "@eventual/core/internal";
import { SubscriptionProvider } from "../providers/subscription-provider.js";
import {
  WorkerIntrinsicDeps,
  registerWorkerIntrinsics,
  getServiceContext,
} from "./utils.js";

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
  registerWorkerIntrinsics(deps);

  return async function (events) {
    return await serviceTypeScope(ServiceType.Subscription, async () => {
      await Promise.allSettled(
        events.map((event) =>
          Promise.allSettled(
            deps.subscriptionProvider
              .getSubscriptionsForEvent(event.name)
              .map((handler) =>
                handler(event.event, { service: getServiceContext(deps) })
              )
          )
        )
      );
    });
  };
}
