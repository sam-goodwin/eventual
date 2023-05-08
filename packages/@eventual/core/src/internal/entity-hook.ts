import { z } from "zod";
import type { Entity, EntityTransactItem } from "../entity.js";

declare global {
  // eslint-disable-next-line no-var
  var eventualEntityHook: EntityHook | undefined;
}

export interface EntityDefinition<E> {
  name: string;
  schema: z.Schema<E>;
}

export type EntityMethods<E> = Pick<
  Entity<E>,
  "get" | "getWithMetadata" | "delete" | "set" | "list" | "listKeys"
>;

/**
 * Registers and returns functioning {@link Entity}s.
 *
 * Does not handle the workflow case. That is handled by the {@link entity} function in core.
 */
export interface EntityHook {
  getEntity<Entity>(name: string): Promise<EntityMethods<Entity> | undefined>;
  transactWrite(items: EntityTransactItem<any>[]): Promise<void>;
}

export function getEntityHook() {
  const hook = globalThis.eventualEntityHook;
  if (!hook) {
    throw new Error("An entity hook has not been registered.");
  }
  return hook;
}

export function registerEntityHook(entityHook: EntityHook) {
  return (globalThis.eventualEntityHook = entityHook);
}
