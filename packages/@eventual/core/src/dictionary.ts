import { z } from "zod";
import { getDictionaryHook } from "./internal/dictionary-hook.js";
import { isOrchestratorWorker } from "./internal/flags.js";
import { dictionaries } from "./internal/global.js";
import { createDictionaryCall } from "./internal/index.js";

export interface DictionaryListResult<Entity> {
  entries?: { key: string; entity: Entity }[];
  /**
   * Returned when there are more values than the limit allowed to return.
   */
  nextToken?: string;
}

export interface DictionaryListKeysResult {
  keys?: string[];
  /**
   * Returned when there are more values than the limit allowed to return.
   */
  nextToken?: string;
}

export interface DictionaryListRequest {
  prefix?: string;
  /**
   * Number of items to retrieve
   * @default 100
   */
  limit?: number;
  nextToken?: string;
}

export interface Dictionary<Entity> {
  name: string;
  schema?: z.Schema<Entity>;
  get(key: string): Promise<Entity | undefined>;
  set(key: string, entity: Entity): Promise<void>;
  delete(key: string): Promise<void>;
  list(request: DictionaryListRequest): Promise<DictionaryListResult<Entity>>;
  listKeys(request: DictionaryListRequest): Promise<DictionaryListKeysResult>;
}

export function dictionary<Entity>(
  name: string,
  schema: z.Schema<Entity>
): Dictionary<Entity> {
  if (dictionaries().has(name)) {
    throw new Error(`Dictionary ${name} already exists`);
  }

  const dictionary: Dictionary<Entity> = {
    name,
    schema: schema,
    get: async (key) => {
      if (isOrchestratorWorker()) {
        return createDictionaryCall(name, { operation: "get", key });
      } else {
        return (await getDictionary()).get(key);
      }
    },
    set: async (key, entity) => {
      if (isOrchestratorWorker()) {
        return createDictionaryCall(name, {
          operation: "set",
          key,
          value: entity,
        });
      } else {
        return (await getDictionary()).set(key, entity);
      }
    },
    delete: async (key) => {
      if (isOrchestratorWorker()) {
        return createDictionaryCall(name, {
          operation: "delete",
          key,
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
