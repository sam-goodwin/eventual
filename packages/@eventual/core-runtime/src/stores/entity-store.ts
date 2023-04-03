import type {
  CompositeKey,
  EntityConsistencyOptions,
  EntityListKeysResult,
  EntityListRequest,
  EntityListResult,
  EntitySetOptions,
  EntityTransactItem,
} from "@eventual/core";

export interface EntityStore {
  getEntityValue<Entity>(
    name: string,
    key: string | CompositeKey
  ): Promise<EntityWithMetadata<Entity> | undefined>;
  setEntityValue<Entity>(
    name: string,
    key: string | CompositeKey,
    entity: Entity,
    options?: EntitySetOptions
  ): Promise<{ version: number } | UnexpectedVersionResult>;
  deleteEntityValue(
    name: string,
    key: string | CompositeKey,
    options?: EntityConsistencyOptions
  ): Promise<void | UnexpectedVersionResult>;
  listEntityEntries<Entity>(
    name: string,
    request: EntityListRequest
  ): Promise<EntityListResult<Entity>>;
  listEntityKeys(
    name: string,
    request: EntityListRequest
  ): Promise<EntityListKeysResult>;
  transactWrite(
    items: EntityTransactItem<any, string>[]
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
