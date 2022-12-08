import {
  registerWorkflowClient,
  registerEventClient,
  eventSubscriptions,
} from "../../global.js";
import type { WorkflowClient } from "../clients/workflow-client.js";
import type { EventClient } from "../clients/event-client.js";
import type {
  EventEnvelope,
  EventHandler,
  EventPayload,
  EventSubscription,
} from "../../event.js";

/**
 * The dependencies of {@link createEventHandler}.
 */
export interface EventHandlerDependencies {
  /**
   * The {@link WorkflowClient} for interacting with workflows contained
   * within the service boundary.
   */
  workflowClient: WorkflowClient;
  /**
   * The {@link EventClient} for publishing events to the service's event bus.
   */
  eventClient: EventClient;
}

/**
 * Creates a generic function for handling inbound event requests
 * that can be used in runtime implementations. This implementation is
 * decoupled from a runtime's specifics by the clients. A runtime must
 * inject its own client implementations designed for that platform.
 */
export function createEventHandler({
  workflowClient,
  eventClient,
}: EventHandlerDependencies) {
  // make the workflow client available to web hooks
  registerWorkflowClient(workflowClient);
  registerEventClient(eventClient);

  const subscriptions = indexEventSubscriptions(eventSubscriptions());

  return async function (events: EventEnvelope[]) {
    await Promise.allSettled(
      events.map((event) =>
        Promise.allSettled(
          subscriptions[event.name]?.map((handler) => handler(event)) ?? []
        )
      )
    );
  };
}

/**
 * Create an index of Event Name to a list of all handler functions
 * subscribed to that event.
 */
function indexEventSubscriptions(
  subscriptions: EventSubscription<EventPayload>[]
) {
  return subscriptions
    .flatMap((e) =>
      e.subscriptions.map((sub) => [sub.name, e.handler] as const)
    )
    .reduce<Record<string, EventHandler<EventPayload>[]>>(
      (index, [name, handler]) => ({
        ...index,
        ...(name in index
          ? {
              [name]: [...index[name]!, handler],
            }
          : {
              [name]: [handler],
            }),
      }),
      {}
    );
}
