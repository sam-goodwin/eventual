import { Event, EventSubscription } from "./event.js";
import type { Eventual, EventualCallCollector } from "./eventual.js";
import { EventClient } from "./runtime/clients/event-client.js";
import type { WorkflowClient } from "./runtime/clients/workflow-client.js";
import type { Workflow } from "./workflow.js";

export const workflows = (): Map<string, Workflow> =>
  ((globalThis as any).workflows ??= new Map<string, Workflow>());

export const events = (): Map<string, Event> =>
  ((globalThis as any).events ??= new Map<string, Event>());

export const eventSubscriptions = (): EventSubscription[] =>
  ((globalThis as any).eventSubscriptions ??= []);

export const callableActivities = (): Record<string, Function> =>
  ((globalThis as any).callableActivities ??= {});

const eventualCollector = (): EventualCallCollector => {
  const collector = (globalThis as any).eventualCollector;
  if (!collector) {
    throw new Error("No Eventual Collector Provided");
  }
  return collector;
};

export function registerEventual<A extends Eventual>(eventual: A): A {
  return eventualCollector().pushEventual(eventual);
}

export function setEventualCollector(collector: EventualCallCollector) {
  (globalThis as any).eventualCollector = collector;
}

export function clearEventualCollector() {
  (globalThis as any).eventualCollector = undefined;
}

export function resetActivityCollector() {
  (globalThis as any).activityCollector = [];
}

// a global variable for storing the WorkflowClient
// this is initialized by Eventual's harness functions
let workflowClient: WorkflowClient;

/**
 * Register the global workflow client used by workflow functions
 * to start workflows within an eventual-controlled environment.
 */
export function registerWorkflowClient(client: WorkflowClient) {
  workflowClient = client;
}

/**
 * Get the global workflow client.
 */
export function getWorkflowClient(): WorkflowClient {
  if (workflowClient === undefined) {
    throw new Error(`WorkflowClient is not registered`);
  }
  return workflowClient;
}

// a global variable for storing the EventClient
// this is initialized by Eventual's harness functions
let eventClient: EventClient;

/**
 * Register the global event client sued by the event emit functions
 * to emit events within an eventual-controlled environment.
 */
export function registerEventClient(client: EventClient) {
  eventClient = client;
}

/**
 * Get the global event client.
 */
export function getEventClient(): EventClient {
  if (eventClient === undefined) {
    throw new Error(`EventClient is not registered`);
  }
  return eventClient;
}
