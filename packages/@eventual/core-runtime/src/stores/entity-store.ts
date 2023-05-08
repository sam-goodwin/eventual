import {
  AnyEntity,
  AnyEntityKey,
  EntityCompositeKey,
  EntityKeyTuple,
  EntityKeyType,
} from "@eventual/core";
import { EntityHook, EntityKeySpec } from "@eventual/core/internal";

export interface EntityStore extends EntityHook {}

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

export interface NormalizeEntityKeyPart {
  field: string;
  type: "number" | "string" | "binary";
  value: EntityKeyType;
}

export interface NormalizeEntityKey {
  partition: NormalizeEntityKeyPart;
  sort?: NormalizeEntityKeyPart;
}

export function normalizeCompositeKey(
  entity: AnyEntity,
  key: AnyEntityKey
): NormalizeEntityKey {
  const { key: partitionField, type: partitionType } = normalizeKeySpec(
    entity.partitionKey
  );
  const { key: sortField = undefined, type: sortType = undefined } =
    entity.sortKey ? normalizeKeySpec(entity.sortKey) : {};

  if (Array.isArray(key)) {
    const [partition, sort] = key;

    return sortField && sortType
      ? {
          partition: {
            field: partitionField,
            type: partitionType,
            value: partition,
          },
          sort: { field: sortField, type: sortType, value: sort },
        }
      : {
          partition: {
            field: partitionField,
            type: partitionType,
            value: partition,
          },
        };
  } else {
    return sortField && sortType
      ? {
          partition: {
            field: partitionField,
            type: partitionType,
            value: key[partitionField],
          },
          sort: {
            field: sortField,
            type: sortType,
            value: key[sortField],
          },
        }
      : {
          partition: {
            field: partitionField,
            type: partitionType,
            value: key[partitionField],
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

export function normalizeKeySpec(
  keyRef: EntityKeySpec
): Exclude<EntityKeySpec, string> {
  return typeof keyRef === "string" ? { key: keyRef, type: "string" } : keyRef;
}
