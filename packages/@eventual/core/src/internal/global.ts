import type { AsyncLocalStorage } from "async_hooks";
import type { Entity } from "../entity.js";
import type { Event } from "../event.js";
import type { AnyCommand } from "../http/command.js";
import type { EventualServiceClient } from "../service-client.js";
import type { Subscription } from "../subscription.js";
import type { Task } from "../task.js";
import type { Transaction } from "../transaction.js";
import type { Workflow } from "../workflow.js";
import type { EnvironmentManifest, ServiceSpec } from "./service-spec.js";
import type { TaskRuntimeContext } from "./task.js";

declare global {
  // eslint-disable-next-line no-var
  var _eventual: {
    /**
     * Data about the current task assigned before running a task on an the task worker.
     */
    taskContextStore?: Promise<AsyncLocalStorage<TaskRuntimeContext>>;
    /**
     * Callable tasks which register themselves in a task worker.
     */
    tasks?: Record<string, Task>;
    /**
     * Available workflows which have registered themselves.
     *
     * Used by the orchestrator, task worker, and other scopes to interact with workflows in
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
    /**
     * A collection of information about the environment, including the {@link ServiceSpec}.
     */
    environmentManifest?: EnvironmentManifest;
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

export const tasks = (): Record<string, Task<any, any, any>> =>
  (globalThis._eventual.tasks ??= {});

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

export async function taskContextScope<Output>(
  context: TaskRuntimeContext,
  handler: () => Output
): Promise<Awaited<Output>> {
  if (!globalThis._eventual.taskContextStore) {
    globalThis._eventual.taskContextStore = import("async_hooks").then(
      (imp) => new imp.AsyncLocalStorage<TaskRuntimeContext>()
    );
  }
  return await (
    await globalThis._eventual.taskContextStore
  ).run(context, async () => {
    return await handler();
  });
}

export async function getTaskContext(): Promise<TaskRuntimeContext> {
  const context = (await globalThis._eventual.taskContextStore)?.getStore();

  if (!context) {
    throw new Error(
      "Task Context has not been registered yet or this is not the task worker."
    );
  }
  return context;
}

export function getEnvironmentManifest() {
  return globalThis._eventual.environmentManifest;
}

export function registerEnvironmentManifest(envManifest: EnvironmentManifest) {
  return (globalThis._eventual.environmentManifest = envManifest);
}
