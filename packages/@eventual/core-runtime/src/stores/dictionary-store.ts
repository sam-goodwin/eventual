import type {
  CompositeKey,
  DictionaryConsistencyOptions,
  DictionaryListKeysResult,
  DictionaryListRequest,
  DictionaryListResult,
  DictionarySetOptions,
} from "@eventual/core";

export interface DictionaryStore {
  getDictionaryValue<Entity>(
    name: string,
    key: string | CompositeKey
  ): Promise<EntityWithMetadata<Entity> | undefined>;
  setDictionaryValue<Entity>(
    name: string,
    key: string | CompositeKey,
    entity: Entity,
    options?: DictionarySetOptions
  ): Promise<{ version: number } | UnexpectedVersionResult>;
  deleteDictionaryValue(
    name: string,
    key: string | CompositeKey,
    options?: DictionaryConsistencyOptions
  ): Promise<void | UnexpectedVersionResult>;
  listDictionaryEntries<Entity>(
    name: string,
    request: DictionaryListRequest
  ): Promise<DictionaryListResult<Entity>>;
  listDictionaryKeys(
    name: string,
    request: DictionaryListRequest
  ): Promise<DictionaryListKeysResult>;
}

export interface EntityWithMetadata<Entity> {
  entity: Entity;
  version: number;
}

export interface UnexpectedVersionResult {
  unexpectedVersion: true;
}

export function isUnexpectedVersionResult(
  value: any
): value is UnexpectedVersionResult {
  return value && "unexpectedVersion" in value;
}

export function normalizeCompositeKey(key: string | CompositeKey) {
  return typeof key === "string" ? { key, namespace: undefined } : key;
}
