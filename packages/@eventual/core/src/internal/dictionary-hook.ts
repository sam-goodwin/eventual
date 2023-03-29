import { z } from "zod";
import type { Dictionary, DictionaryTransactItem } from "../dictionary.js";

declare global {
  var eventualDictionaryHook: DictionaryHook | undefined;
}

export interface DictionaryDefinition<Entity> {
  name: string;
  schema: z.Schema<Entity>;
}

export type DictionaryMethods<Entity> = Pick<
  Dictionary<Entity>,
  "get" | "getWithMetadata" | "delete" | "set" | "list" | "listKeys"
>;

/**
 * Registers and returns functioning {@link Dictionary}s.
 *
 * Does not handle the workflow case. That is handled by the {@link dictionary} function in core.
 */
export interface DictionaryHook {
  getDictionary<Entity>(
    name: string
  ): Promise<DictionaryMethods<Entity> | undefined>;
  transactWrite(items: DictionaryTransactItem<any>[]): Promise<void>;
}

export function tryGetDictionaryHook() {
  return globalThis.eventualDictionaryHook;
}

export function getDictionaryHook() {
  const hook = tryGetDictionaryHook();
  if (!hook) {
    throw new Error("A Dictionary hook has not been registered.");
  }
  return hook;
}

export function registerDictionaryHook(dictionaryHook: DictionaryHook) {
  return (globalThis.eventualDictionaryHook = dictionaryHook);
}
