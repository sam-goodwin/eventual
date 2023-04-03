import type { AsyncLocalStorage } from "async_hooks";
import type { Activity } from "../activity.js";
import { Entity } from "../entity.js";
import type { Event } from "../event.js";
import type { AnyCommand } from "../http/command.js";
import type { EventualServiceClient } from "../service-client.js";
import type { Subscription } from "../subscription.js";
import type { Transaction } from "../transaction.js";
import type { Workflow } from "../workflow.js";
import type { ActivityRuntimeContext } from "./activity.js";

declare global {
  // eslint-disable-next-line no-var
  var _eventual: {
    /**
     * Data about the current activity assigned before running an activity on an the activity worker.
     */
    activityContextStore?: Promise<AsyncLocalStorage<ActivityRuntimeContext>>;
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
    transactions?: Map<string, Transaction>;
    /**
     * A simple key value store that work efficiently within eventual.
     */
    entities?: Map<string, Entity<any>>;
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
    commands?: AnyCommand[];
  };
}

globalThis._eventual ??= {};

export const commands = (globalThis._eventual.commands ??= []);

export const workflows = (): Map<string, Workflow> =>
  (globalThis._eventual.workflows ??= new Map<string, Workflow>());

export const transactions = (): Map<string, Transaction> =>
  (globalThis._eventual.transactions ??= new Map<string, Transaction>());

export const events = (): Map<string, Event> =>
  (globalThis._eventual.events ??= new Map<string, Event>());

export const subscriptions = (): Subscription[] =>
  (globalThis._eventual.subscriptions ??= []);

export const entities = (): Map<string, Entity<any>> =>
  (globalThis._eventual.entities ??= new Map<string, Entity<any>>());

export function clearEventHandlers() {
  globalThis._eventual.subscriptions = [];
}

export const activities = (): Record<string, Activity<any, any, any>> =>
  (globalThis._eventual.activities ??= {});

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

export async function activityContextScope<Output>(
  context: ActivityRuntimeContext,
  handler: () => Output
): Promise<Awaited<Output>> {
  if (!globalThis._eventual.activityContextStore) {
    globalThis._eventual.activityContextStore = import("async_hooks").then(
      (imp) => new imp.AsyncLocalStorage<ActivityRuntimeContext>()
    );
  }
  return await (
    await globalThis._eventual.activityContextStore
  ).run(context, async () => {
    return await handler();
  });
}

export async function getActivityContext(): Promise<ActivityRuntimeContext> {
  const context = (await globalThis._eventual.activityContextStore)?.getStore();

  if (!context) {
    throw new Error(
      "Activity Context has not been registered yet or this is not the activity worker."
    );
  }
  return context;
}
