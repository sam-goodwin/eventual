import { Event, EventSubscription } from "./event.js";
import { ActivityContext, ActivityHandler } from "./activity.js";
import type { Eventual, EventualCallCollector } from "./eventual.js";
import { EventClient } from "./runtime/clients/event-client.js";
import type { WorkflowClient } from "./runtime/clients/workflow-client.js";
import type { Workflow } from "./workflow.js";

declare global {
  // eslint-disable-next-line no-var
  var _eventual: {
    /**
     * Data about the current activity assigned before running an activity on an the activity worker.
     */
    activityContext?: ActivityContext;
    /**
     * An object used by the interpreter to collect {@link Eventual}s while running a workflow code.
     *
     * Set by the interpreter only when needed.
     */
    eventualCollector?: EventualCallCollector;
    /**
     * Callable activities which register themselves in an activity worker.
     */
    callableActivities?: Record<string, ActivityHandler<any>>;
    /**
     * Available workflows which have registered themselves.
     *
     * Used by the orchestrator, activity worker, and other scopes to interact with workflows in
     * a service.
     */
    workflows?: Map<string, Workflow>;
    /**
     * A global variable for storing the WorkflowClient
     * this is initialized by Eventual's harness lambda functions
     */
    workflowClient?: WorkflowClient;
    /**
     * A global variable storing a map of event name (which is globally unique)
     * to the {@link Event} declaration instance.
     */
    events?: Map<string, Event>;
    /**
     * A global variable storing a list of all {@link EventSubscription}s declared
     * within this application.
     */
    eventSubscriptions?: EventSubscription[];

    /**
     * A global variable for storing the {@link EventClient}
     *
     * This is initialized by Eventual's harness functions
     */
    eventClient?: EventClient;
  };
}

globalThis._eventual = {};

export const workflows = (): Map<string, Workflow> =>
  (globalThis._eventual.workflows ??= new Map<string, Workflow>());

export const events = (): Map<string, Event> =>
  (globalThis._eventual.events ??= new Map<string, Event>());

export const eventSubscriptions = (): EventSubscription[] =>
  (globalThis._eventual.eventSubscriptions ??= []);

export function clearEventSubscriptions() {
  globalThis._eventual.eventSubscriptions = [];
}

export const callableActivities = (): Record<string, ActivityHandler<any>> =>
  (globalThis._eventual.callableActivities ??= {});

const eventualCollector = (): EventualCallCollector => {
  const collector = globalThis._eventual.eventualCollector;
  if (!collector) {
    throw new Error("No Eventual Collector Provided");
  }
  return collector;
};

export function registerEventual<A extends Eventual>(eventual: A): A {
  return eventualCollector().pushEventual(eventual);
}

export function setEventualCollector(collector: EventualCallCollector) {
  globalThis._eventual.eventualCollector = collector;
}

export function clearEventualCollector() {
  globalThis._eventual.eventualCollector = undefined;
}

/**
 * Register the global workflow client used by workflow functions
 * to start workflows within an eventual-controlled environment.
 */
export function registerWorkflowClient(client: WorkflowClient) {
  globalThis._eventual.workflowClient = client;
}

/**
 * Get the global workflow client.
 */
export function getWorkflowClient(): WorkflowClient {
  if (globalThis._eventual.workflowClient === undefined) {
    throw new Error(`WorkflowClient is not registered`);
  }
  return globalThis._eventual.workflowClient;
}

export function setActivityContext(context: ActivityContext) {
  globalThis._eventual.activityContext = context;
}

export function getActivityContext(): ActivityContext {
  const context = globalThis._eventual.activityContext;

  if (!context) {
    throw new Error(
      "Activity Context has not been registered yet or this is not the activity worker."
    );
  }
  return context;
}

/**
 * Register the global event client sued by the event emit functions
 * to emit events within an eventual-controlled environment.
 */
export function registerEventClient(client: EventClient) {
  globalThis._eventual.eventClient = client;
}

/**
 * Get the global event client.
 */
export function getEventClient(): EventClient {
  if (globalThis._eventual.eventClient === undefined) {
    throw new Error(`EventClient is not registered`);
  }
  return globalThis._eventual.eventClient;
}
