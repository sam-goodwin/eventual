import type {
  Entity,
  EntityQueryOptions,
  EntityQueryResult,
  EntityTransactItem,
} from "../entity/entity.js";
import { QueryKey } from "../entity/key.js";

declare global {
  // eslint-disable-next-line no-var
  var eventualEntityHook: EntityHook | undefined;
}

export type EntityMethod = Exclude<
  {
    [k in keyof Entity]: [Entity[k]] extends [Function] ? k : never;
  }[keyof Entity],
  "partition" | "sort" | "stream" | "index" | undefined
>;

/**
 * Registers and returns functioning {@link Entity}s.
 *
 * Does not handle the workflow case. That is handled by the {@link entity} function in core.
 */
export type EntityHook = {
  [K in EntityMethod]: (
    entityName: string,
    ...args: Parameters<Entity[K]>
  ) => ReturnType<Entity[K]>;
} & {
  queryIndex(
    entityName: string,
    indexName: string,
    queryKey: QueryKey,
    options?: EntityQueryOptions
  ): Promise<EntityQueryResult>;
  scanIndex(
    entityName: string,
    indexName: string,
    options?: EntityQueryOptions
  ): Promise<EntityQueryResult>;
  transactWrite(items: EntityTransactItem[]): Promise<void>;
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
