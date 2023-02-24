import { Activity, ActivityContext } from "../activity.js";
import { Event } from "../event.js";
import type { Command } from "../http/index.js";
import { EventualServiceClient } from "../service-client.js";
import { Subscription } from "../subscription.js";
import type { Workflow } from "../workflow.js";
import type { Eventual, EventualCallCollector } from "./eventual.js";

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
    activities?: Record<string, Activity>;
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
     * A global variable storing a list of all {@link Subscription}s declared
     * within this application.
     */
    subscriptions?: Subscription[];
    /**
     * API routes registered within the application.
     */
    commands?: Command<any, any, any, any, any, any>[];
  };
}

globalThis._eventual ??= {};

export const commands = (globalThis._eventual.commands ??= []);

export const workflows = (): Map<string, Workflow> =>
  (globalThis._eventual.workflows ??= new Map<string, Workflow>());

export const events = (): Map<string, Event> =>
  (globalThis._eventual.events ??= new Map<string, Event>());

export const subscriptions = (): Subscription[] =>
  (globalThis._eventual.subscriptions ??= []);

export function clearEventHandlers() {
  globalThis._eventual.subscriptions = [];
}

export const activities = (): Record<string, Activity<any, any, any>> =>
  (globalThis._eventual.activities ??= {});

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
