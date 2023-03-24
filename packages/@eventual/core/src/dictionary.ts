import { z } from "zod";
import { getDictionaryHook } from "./internal/dictionary-hook.js";
import { isOrchestratorWorker } from "./internal/flags.js";
import { dictionaries } from "./internal/global.js";

export interface DictionaryListResult<Entity> {
  entries?: { key: string; entity: Entity }[];
  cursor?: string;
}

export interface DictionaryListKeysResult {
  keys?: string[];
  cursor?: string;
}

export interface DictionaryListRequest {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

export interface Dictionary<Entity> {
  name: string;
  schema: z.Schema<Entity>;
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
        throw new Error("Implement Me");
      } else {
        return (await getDictionary()).get(key);
      }
    },
    set: async (key, entity) => {
      if (isOrchestratorWorker()) {
        throw new Error("Implement Me");
      } else {
        return (await getDictionary()).set(key, entity);
      }
    },
    delete: async (key) => {
      if (isOrchestratorWorker()) {
        throw new Error("Implement Me");
      } else {
        return (await getDictionary()).delete(key);
      }
    },
    list: async (request) => {
      if (isOrchestratorWorker()) {
        throw new Error("Implement Me");
      } else {
        return (await getDictionary()).list(request);
      }
    },
    listKeys: async (request) => {
      if (isOrchestratorWorker()) {
        throw new Error("Implement Me");
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
