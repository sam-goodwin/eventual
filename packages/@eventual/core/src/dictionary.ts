import { z } from "zod";
import { getDictionaryHook } from "./internal/dictionary-hook.js";
import { isOrchestratorWorker } from "./internal/flags.js";
import { dictionaries } from "./internal/global.js";
import { createDictionaryCall } from "./internal/index.js";

export interface CompositeKey {
  namespace: string;
  key: string;
}

export interface DictionaryListResult<Entity> {
  entries?: { key: string; entity: Entity; version: number }[];
  /**
   * Returned when there are more values than the limit allowed to return.
   */
  nextToken?: string;
}

export interface DictionaryListKeysResult {
  /**
   * Keys that match the provided prefix. If using composite keys, this will only be the key part (not the namespace).
   */
  keys?: string[];
  /**
   * Returned when there are more values than the limit allowed to return.
   */
  nextToken?: string;
}

export interface DictionaryListRequest {
  /**
   * Namespace to retrieve values for.
   *
   * @default - retrieve values with no namespace.
   */
  namespace?: string;
  /**
   * Key prefix to retrieve values or keys for.
   * Values are only retrieved for a single name + namespace pair (including no namespace).
   */
  prefix?: string;
  /**
   * Number of items to retrieve
   * @default 100
   */
  limit?: number;
  nextToken?: string;
}

export interface DictionaryConsistencyOptions {
  /**
   * The expected version of the entity in the dictionary.
   *
   * Used to support consistent writes and deletes.
   * A value of 0 will only pass if the item is new.
   */
  expectedVersion?: number;
}

export interface DictionarySetOptions extends DictionaryConsistencyOptions {
  /**
   * Whether or not to update the version on change.
   * If this is the first time the value has been set, it will be set to 1.
   *
   * @default true - version will be incremented.
   */
  incrementVersion?: boolean;
}

export interface Dictionary<Entity> {
  name: string;
  schema?: z.Schema<Entity>;
  /**
   * Get a value.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  get(key: string | CompositeKey): Promise<Entity | undefined>;
  /**
   * Get a value and metadata like version.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  getWithMetadata(
    key: string | CompositeKey
  ): Promise<{ entity: Entity; version: number } | undefined>;
  /**
   * Sets or updates a value within a dictionary and optionally a namespace.
   *
   * Values with namespaces are considered distinct from value without a namespace or within different namespaces.
   * Values and keys can only be listed within a single namespace.
   */
  set(
    key: string | CompositeKey,
    entity: Entity,
    options?: DictionarySetOptions
  ): Promise<{ version: number }>;
  /**
   * Deletes a single entry within a dictionary and namespace.
   */
  delete(
    key: string | CompositeKey,
    options?: DictionaryConsistencyOptions
  ): Promise<void>;
  /**
   * List entries that match a prefix within a dictionary and namespace.
   *
   * If namespace is not provided, only values which do not use composite keys will be returned.
   */
  list(request: DictionaryListRequest): Promise<DictionaryListResult<Entity>>;
  /**
   * List keys that match a prefix within a dictionary and namespace.
   *
   * If namespace is not provided, only values which do not use composite keys will be returned.
   */
  listKeys(request: DictionaryListRequest): Promise<DictionaryListKeysResult>;
}

export function dictionary<Entity>(
  name: string,
  schema?: z.Schema<Entity>
): Dictionary<Entity> {
  if (dictionaries().has(name)) {
    throw new Error(`Dictionary ${name} already exists`);
  }

  const dictionary: Dictionary<Entity> = {
    name,
    schema,
    get: async (key: string | CompositeKey) => {
      if (isOrchestratorWorker()) {
        return createDictionaryCall(name, { operation: "get", key });
      } else {
        return (await getDictionary()).get(key);
      }
    },
    getWithMetadata: async (key: string | CompositeKey) => {
      if (isOrchestratorWorker()) {
        return createDictionaryCall(name, {
          operation: "getWithMetadata",
          key,
        });
      } else {
        const dictionary = await getDictionary();
        return dictionary.getWithMetadata(key);
      }
    },
    set: async (
      key: string | CompositeKey,
      entity: Entity,
      options?: DictionarySetOptions
    ) => {
      if (isOrchestratorWorker()) {
        return createDictionaryCall(name, {
          operation: "set",
          key,
          value: entity,
          options,
        });
      } else {
        return (await getDictionary()).set(key, entity, options);
      }
    },
    delete: async (key, options) => {
      if (isOrchestratorWorker()) {
        return createDictionaryCall(name, {
          operation: "delete",
          key,
          options,
        });
      } else {
        return (await getDictionary()).delete(key);
      }
    },
    list: async (request) => {
      if (isOrchestratorWorker()) {
        return createDictionaryCall(name, { operation: "list", request });
      } else {
        return (await getDictionary()).list(request);
      }
    },
    listKeys: async (request) => {
      if (isOrchestratorWorker()) {
        return createDictionaryCall(name, { operation: "listKeys", request });
      } else {
        return (await getDictionary()).listKeys(request);
      }
    },
  };

  dictionaries().set(name, dictionary);

  return dictionary;

  async function getDictionary() {
    const dictionaryHook = getDictionaryHook();
    const dictionary = await dictionaryHook.getDictionary<Entity>(name);
    if (!dictionary) {
      throw new Error(`Dictionary ${name} does not exist.`);
    }
    return dictionary;
  }
}
