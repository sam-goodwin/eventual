import type { MapValue } from "type-fest/source/entry.js";
import type { Bucket } from "../bucket.js";
import type { Entity } from "../entity/entity.js";
import type { Event } from "../event.js";
import type { AnyCommand } from "../http/command.js";
import type { SearchIndex } from "../search/search-index.js";
import type { EventualServiceClient } from "../service-client.js";
import type { Subscription } from "../subscription.js";
import type { Task } from "../task.js";
import type { Transaction } from "../transaction.js";
import type { Workflow } from "../workflow.js";
import type { EnvironmentManifest, ServiceSpec } from "./service-spec.js";

interface EventualResources {
  /**
   * Callable tasks which register themselves in a task worker.
   */
  tasks?: Map<string, Task>;
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
  entities?: Map<string, Entity>;
  /**
   * A data bucket within eventual.
   */
  buckets?: Map<string, Bucket>;
  /**
   * The search indexes within this eventual service.
   */
  searchIndices?: Map<string, SearchIndex>;
  /**
   * A global variable storing a map of event name (which is globally unique)
   * to the {@link Event} declaration instance.
   */
  events?: Map<string, Event>;
  /**
   * A global variable storing a list of all {@link Subscription}s declared
   * within this application.
   */
  subscriptions?: Map<string, Subscription>;
  /**
   * API routes registered within the application.
   */
  commands?: Map<string, AnyCommand>;
}

declare global {
  // eslint-disable-next-line no-var
  var _eventual: EventualResources & {
    /**
     * A global variable for storing the WorkflowClient
     * this is initialized by Eventual's harness lambda functions
     */
    serviceClient?: EventualServiceClient;

    /**
     * A collection of information about the environment, including the {@link ServiceSpec}.
     */
    environmentManifest?: EnvironmentManifest;
  };
}

globalThis._eventual ??= {};

export function registerEventualResource<
  Kind extends keyof EventualResources,
  T extends MapValue<Exclude<EventualResources[Kind], undefined>>
>(resourceKind: Kind, resource: T): T {
  if (globalThis._eventual[resourceKind]?.has(resource.name)) {
    throw new Error(
      `${resourceKind} with name '${resource.name}' already exists`
    );
  }
  (globalThis._eventual[resourceKind] ??= new Map()).set(
    resource.name,
    resource
  );
  return resource;
}

export function getEventualResource<Kind extends keyof EventualResources>(
  resourceKind: Kind,
  name: string
): MapValue<Exclude<EventualResources[Kind], undefined>> | undefined {
  return globalThis._eventual[resourceKind]?.get(name) as
    | MapValue<Exclude<EventualResources[Kind], undefined>>
    | undefined;
}

export function getEventualResources<Kind extends keyof EventualResources>(
  resourceKind: Kind
): Exclude<EventualResources[Kind], undefined> {
  return (globalThis._eventual[resourceKind] ?? new Map()) as Exclude<
    EventualResources[Kind],
    undefined
  >;
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

export function getEnvironmentManifest() {
  return globalThis._eventual.environmentManifest;
}

export function registerEnvironmentManifest(envManifest: EnvironmentManifest) {
  return (globalThis._eventual.environmentManifest = envManifest);
}
