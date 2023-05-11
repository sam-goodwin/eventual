import type {
  AnyEntity,
  EntityCompositeKeyMapFromEntity,
  EntityKeyFromEntity,
  EntityKeyMap,
  EntityKeyType,
  EntityKeyDefinition,
  EntityKeyDefinitionPart,
} from "@eventual/core";
import type { EntityHook } from "@eventual/core/internal";

export type EntityStore = EntityHook;

export interface NormalizedEntityKeyPartBase extends EntityKeyDefinitionPart {
  parts: { field: string; value: EntityKeyType }[];
}

export type NormalizedEntityKeyPart =
  | NormalizedEntityKeyPartialPart
  | NormalizedEntityKeyCompletePart;

export interface NormalizedEntityKeyCompletePart
  extends NormalizedEntityKeyPartBase {
  keyValue: string | number;
  partialValue: false;
}

export interface NormalizedEntityKeyPartialPart
  extends NormalizedEntityKeyPartBase {
  keyValue?: string | number;
  partialValue: true;
}

export function isCompleteKeyPart(
  key: NormalizedEntityKeyPart
): key is NormalizedEntityKeyCompletePart {
  return !key.partialValue;
}

export function isCompleteKey(
  key: NormalizedEntityCompositeKey
): key is NormalizedEntityCompositeKey<
  NormalizedEntityKeyCompletePart,
  NormalizedEntityKeyCompletePart
> {
  return (
    isCompleteKeyPart(key.partition) &&
    (!key.sort || isCompleteKeyPart(key.sort))
  );
}

export interface NormalizedEntityCompositeKey<
  Partition extends NormalizedEntityKeyPart = NormalizedEntityKeyPart,
  Sort extends NormalizedEntityKeyPart = NormalizedEntityKeyPart
> {
  partition: Partition;
  sort?: Sort;
}

/**
 * Generate properties for an entity key given the key definition and key values.
 */
export function normalizeCompositeKey<E extends AnyEntity>(
  entity: E | EntityKeyDefinition,
  key: Partial<EntityKeyFromEntity<E>>
): NormalizedEntityCompositeKey {
  const keyDef = "partition" in entity ? entity : entity.key;

  const partitionCompositeKey = formatNormalizedPart(keyDef.partition, (p, i) =>
    Array.isArray(key) ? key[i] : (key as EntityCompositeKeyMapFromEntity<E>)[p]
  );

  const sortCompositeKey = keyDef.sort
    ? formatNormalizedPart(keyDef.sort, (p, i) =>
        Array.isArray(key)
          ? key[i]
          : (key as EntityCompositeKeyMapFromEntity<E>)[p]
      )
    : undefined;

  return sortCompositeKey
    ? {
        partition: partitionCompositeKey,
        sort: sortCompositeKey,
      }
    : {
        partition: partitionCompositeKey,
      };
}

function formatNormalizedPart(
  keyPart: EntityKeyDefinitionPart,
  valueRetriever: (field: string, index: number) => string | number
): NormalizedEntityKeyPart {
  const parts = keyPart.attributes.map((p, i) => ({
    field: p,
    value: valueRetriever(p, i),
  }));

  const missingValueIndex = parts.findIndex((p) => p.value === undefined);

  return {
    type: keyPart.type,
    attributes: keyPart.attributes,
    parts,
    keyAttribute: keyPart.keyAttribute,
    keyValue: (keyPart.type === "number"
      ? parts[0]?.value
      : (missingValueIndex === -1 ? parts : parts.slice(0, missingValueIndex))
          .map((p) => p.value)
          .join("#")) as any,
    partialValue: missingValueIndex !== -1,
  };
}

export function convertNormalizedEntityKeyToMap(
  key: NormalizedEntityCompositeKey
): EntityKeyMap<any, any, any> {
  console.log("input key", JSON.stringify(key));
  const generatedKey = Object.fromEntries([
    ...key.partition.parts.map(({ field, value }) => [field, value]),
    ...(key.sort
      ? key.sort.parts.map(({ field, value }) => [field, value])
      : []),
  ]);
  console.log("generated key", JSON.stringify(generatedKey));
  return generatedKey;
}
