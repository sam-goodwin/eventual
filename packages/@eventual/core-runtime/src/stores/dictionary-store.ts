import type {
  CompositeKey,
  DictionaryConsistencyOptions,
  DictionaryListKeysResult,
  DictionaryListRequest,
  DictionaryListResult,
  DictionarySetOptions,
  DictionaryTransactItem,
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
  transactWrite(
    items: DictionaryTransactItem<any, string>[]
  ): Promise<TransactionCancelledResult | TransactionConflictResult | void>;
}

export interface EntityWithMetadata<Entity> {
  entity: Entity;
  version: number;
}

export interface UnexpectedVersionResult {
  unexpectedVersion: true;
}

export interface TransactionCancelledResult {
  reasons: (UnexpectedVersionResult | undefined)[];
}

export interface TransactionConflictResult {
  transactionConflict: true;
}

export function isUnexpectedVersionResult(
  value: any
): value is UnexpectedVersionResult {
  return value && "unexpectedVersion" in value;
}

export function isTransactionCancelledResult(
  value: any
): value is TransactionCancelledResult {
  return value && "reasons" in value;
}

export function isTransactionConflictResult(
  value: any
): value is TransactionConflictResult {
  return value && "transactionConflict" in value;
}

export function normalizeCompositeKey(key: string | CompositeKey) {
  return typeof key === "string" ? { key, namespace: undefined } : key;
}
