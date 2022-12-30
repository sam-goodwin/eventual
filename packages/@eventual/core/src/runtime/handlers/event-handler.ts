import { registerWorkflowClient, registerEventClient } from "../../global.js";
import type { WorkflowClient } from "../clients/workflow-client.js";
import type { EventClient } from "../clients/event-client.js";
import type { EventEnvelope } from "../../event.js";
import { EventHandlerProvider } from "../providers/event-handler-provider.js";

/**
 * The dependencies of {@link createEventHandlerWorker}.
 */
export interface EventHandlerDependencies {
  /**
   * The {@link WorkflowClient} for interacting with workflows contained
   * within the service boundary.
   */
  workflowClient?: WorkflowClient;
  /**
   * The {@link EventClient} for publishing events to the service's event bus.
   */
  eventClient?: EventClient;
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
  workflowClient,
  eventClient,
  eventHandlerProvider,
}: EventHandlerDependencies): EventHandlerWorker {
  // make the workflow client available to web hooks
  if (workflowClient) {
    registerWorkflowClient(workflowClient);
  }
  if (eventClient) {
    registerEventClient(eventClient);
  }

  return async function (events) {
    await Promise.allSettled(
      events.map((event) =>
        Promise.allSettled(
          eventHandlerProvider
            .getEventHandlersForEvent(event.name)
            .map((handler) => handler(event.event))
        )
      )
    );
  };
}
