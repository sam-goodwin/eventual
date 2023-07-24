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

type Resource =
  | Task
  | Workflow
  | Transaction
  | Entity
  | Bucket
  | SearchIndex
  | AnyCommand
  | Event
  | Subscription;

type ResourceKind = Resource["kind"];

type ResourceOfKind<Kind extends ResourceKind> = Resource & { kind: Kind };

type ResourceCollection = {
  [kind in ResourceKind]?: Map<string, ResourceOfKind<kind>>;
};

declare global {
  // eslint-disable-next-line no-var
  var _eventual: {
    resources: ResourceCollection;
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

globalThis._eventual ??= { resources: {} };

export function registerEventualResource<
  Kind extends ResourceKind,
  T extends ResourceOfKind<Kind>
>(resourceKind: Kind, resource: T): T {
  if (globalThis._eventual.resources[resourceKind]?.has(resource.name)) {
    throw new Error(
      `${resourceKind} with name '${resource.name}' already exists`
    );
  }
  (globalThis._eventual.resources[resourceKind] ??= new Map()).set(
    resource.name,
    resource
  );
  return resource;
}

export function getEventualResource<Kind extends ResourceKind>(
  resourceKind: Kind,
  name: string
): ResourceOfKind<Kind> | undefined {
  return globalThis._eventual.resources[resourceKind]?.get(name);
}

export function getEventualResources<Kind extends ResourceKind>(
  resourceKind: Kind
): Map<string, ResourceOfKind<Kind>> {
  return (globalThis._eventual.resources[resourceKind] ??= new Map());
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
