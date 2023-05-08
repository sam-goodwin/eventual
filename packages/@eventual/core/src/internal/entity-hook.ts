import type { z } from "zod";
import type { AnyEntity, Entity, EntityTransactItem } from "../entity.js";

declare global {
  var eventualEntityHook: EntityHook | undefined;
}

export interface EntityDefinition<E> {
  name: string;
  schema: z.Schema<E>;
}

export type EntityMethod = Exclude<
  {
    [k in keyof AnyEntity]: [AnyEntity[k]] extends [Function] ? k : never;
  }[keyof AnyEntity],
  "partitionKey" | "sortKey" | "stream" | "__entityBrand" | undefined
>;

/**
 * Registers and returns functioning {@link Entity}s.
 *
 * Does not handle the workflow case. That is handled by the {@link entity} function in core.
 */
export type EntityHook = {
  [K in EntityMethod]: (
    entityName: string,
    ...args: Parameters<AnyEntity[K]>
  ) => ReturnType<AnyEntity[K]>;
} & {
  transactWrite(items: EntityTransactItem<any>[]): Promise<void>;
};

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
