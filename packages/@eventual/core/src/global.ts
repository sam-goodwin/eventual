import { ActivityContext, ActivityHandler } from "./activity.js";
import type { Route } from "./http/router.js";
import { Event, EventHandler, EventSubscription } from "./event.js";
import type { Eventual, EventualCallCollector } from "./eventual.js";
import { EventualServiceClient } from "./service-client.js";
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
    serviceClient?: EventualServiceClient;
    /**
     * A global variable storing a map of event name (which is globally unique)
     * to the {@link Event} declaration instance.
     */
    events?: Map<string, Event>;
    /**
     * A global variable storing a list of all {@link EventSubscription}s declared
     * within this application.
     */
    eventHandlers?: EventHandler[];
    /**
     * API routes registered within the application.
     */
    routes?: Route[];
  };
}

globalThis._eventual ??= {};

export const routes = (globalThis._eventual.routes ??= []);

export const workflows = (): Map<string, Workflow> =>
  (globalThis._eventual.workflows ??= new Map<string, Workflow>());

export const events = (): Map<string, Event> =>
  (globalThis._eventual.events ??= new Map<string, Event>());

export const eventHandlers = (): EventHandler<any>[] =>
  (globalThis._eventual.eventHandlers ??= []);

export function clearEventHandlers() {
  globalThis._eventual.eventHandlers = [];
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
 * Register the global service client used by workflow functions
 * to start workflows within an eventual-controlled environment.
 */
export function registerServiceClient(client: EventualServiceClient) {
  globalThis._eventual.serviceClient = client;
}

/**
 * Get the global service client.
 */
export function getServiceClient(): EventualServiceClient {
  if (globalThis._eventual.serviceClient === undefined) {
    throw new Error(`WorkflowClient is not registered`);
  }
  return globalThis._eventual.serviceClient;
}

export function setActivityContext(context: ActivityContext) {
  globalThis._eventual.activityContext = context;
}

export function clearActivityContext() {
  globalThis._eventual.activityContext = undefined;
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
