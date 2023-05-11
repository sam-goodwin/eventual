import type { AnyEntity, EntityTransactItem } from "../entity.js";

declare global {
  // eslint-disable-next-line no-var
  var eventualEntityHook: EntityHook | undefined;
}

export type EntityMethod = Exclude<
  {
    [k in keyof AnyEntity]: [AnyEntity[k]] extends [Function] ? k : never;
  }[keyof AnyEntity],
  "partition" | "sort" | "stream" | undefined
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
