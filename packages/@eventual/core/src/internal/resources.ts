import type { Bucket } from "../bucket.js";
import type { Entity } from "../entity/entity.js";
import type { Event } from "../event.js";
import type { AnyCommand } from "../http/command.js";
import type { Queue } from "../queue.js";
import type { SearchIndex } from "../search/search-index.js";
import type { Socket } from "../socket/socket.js";
import type { Subscription } from "../subscription.js";
import type { Task } from "../task.js";
import type { Transaction } from "../transaction.js";
import type { Workflow } from "../workflow.js";

type Resource =
  | AnyCommand
  | Bucket
  | Entity
  | Event
  | Queue
  | SearchIndex
  | Socket
  | Subscription
  | Task
  | Transaction
  | Workflow;

type ResourceKind = Resource["kind"];

type ResourceOfKind<Kind extends ResourceKind> = Resource & { kind: Kind };

type ResourceCollection = {
  [kind in ResourceKind]?: Map<string, ResourceOfKind<kind>>;
};

declare global {
  // eslint-disable-next-line no-var
  var _eventual: {
    resources: ResourceCollection;
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
