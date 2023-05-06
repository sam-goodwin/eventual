import {
  AnyEntity,
  AnyEntityKey,
  EntityCompositeKey,
  EntityKeyTuple,
} from "@eventual/core";
import { EntityHook } from "@eventual/core/internal";

export interface EntityStore extends EntityHook {}

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

export interface NormalizeEntityKey {
  partition: { field: string; value: string };
  sort?: { field: string; value: string };
}

export function normalizeCompositeKey(
  entity: AnyEntity,
  key: AnyEntityKey
): NormalizeEntityKey {
  if (Array.isArray(key)) {
    const [partition, sort] = key;

    return entity.sortKey
      ? {
          partition: { field: entity.partitionKey, value: partition },
          sort: { field: entity.sortKey, value: sort },
        }
      : {
          partition: { field: entity.partitionKey, value: partition },
        };
  } else {
    return entity.sortKey
      ? {
          partition: {
            field: entity.partitionKey,
            value: key[entity.partitionKey],
          },
          sort: { field: entity.sortKey, value: key[entity.sortKey] },
        }
      : {
          partition: {
            field: entity.partitionKey,
            value: key[entity.partitionKey],
          },
        };
  }
}

export function convertNormalizedEntityKeyToMap(
  key: NormalizeEntityKey
): EntityCompositeKey<any, any, any> {
  return key.sort
    ? {
        [key.partition.field]: key.partition.value,
        [key.sort.field]: key.sort.value,
      }
    : {
        [key.partition.field]: key.partition.value,
      };
}

export function convertNormalizedEntityKeyToTuple(
  key: NormalizeEntityKey
): EntityKeyTuple<any, any, any> {
  return key.sort
    ? [key.partition.value, key.sort.value]
    : [key.partition.value];
}
