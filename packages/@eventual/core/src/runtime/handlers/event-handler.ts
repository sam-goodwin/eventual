import type { EventEnvelope } from "../../event.js";
import { registerServiceClient } from "../../global.js";
import { EventualServiceClient } from "../../service-client.js";
import { ServiceType } from "../../service-type.js";
import { serviceTypeScope } from "../flags.js";
import { EventHandlerProvider } from "../providers/event-handler-provider.js";

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
  eventHandlerProvider: EventHandlerProvider;
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
    return await serviceTypeScope(ServiceType.EventHandler, async () => {
      await Promise.allSettled(
        events.map((event) =>
          Promise.allSettled(
            eventHandlerProvider
              .getEventHandlersForEvent(event.name)
              .map((handler) => handler(event.event))
          )
        )
      );
    });
  };
}
