import type {
  AnyEntity,
  EntityKeyMap,
  EntityCompositeKeyPart,
  EntityKeyFromEntity,
  EntityKeyType,
  EntityCompositeKeyMapFromEntity,
} from "@eventual/core";
import type { EntityHook, EntitySpec } from "@eventual/core/internal";
import type openapi from "openapi3-ts";
import { z } from "zod";

export type EntityStore = EntityHook;

export interface NormalizedEntityKeyDefinitionPart {
  type: "number" | "string";
  keyAttribute: string;
  fields: readonly string[];
}

export interface NormalizedEntityKeyDefinition {
  partition: NormalizedEntityKeyDefinitionPart;
  sort?: NormalizedEntityKeyDefinitionPart;
}

export interface NormalizedEntityKeyPartBase
  extends NormalizedEntityKeyDefinitionPart {
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
  entity: E,
  key: Partial<EntityKeyFromEntity<E>>
): NormalizedEntityCompositeKey {
  const normalizeKey = normalizeEntityKeyDefinition(entity);

  return normalizeCompositeKeyFromKeyDefinition(normalizeKey, key);
}

export function normalizeCompositeKeyFromKeyDefinition<E extends AnyEntity>(
  keyDefinition: NormalizedEntityKeyDefinition,
  key: Partial<EntityKeyFromEntity<E>>
): NormalizedEntityCompositeKey {
  const partitionCompositeKey = formatNormalizedPart(
    keyDefinition.partition,
    (p, i) =>
      Array.isArray(key)
        ? key[i]
        : (key as EntityCompositeKeyMapFromEntity<E>)[p]
  );

  const sortCompositeKey = keyDefinition.sort
    ? formatNormalizedPart(keyDefinition.sort, (p, i) =>
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
  keyPart: NormalizedEntityKeyDefinitionPart,
  valueRetriever: (field: string, index: number) => string | number
): NormalizedEntityKeyPart {
  const parts = keyPart.fields.map((p, i) => ({
    field: p,
    value: valueRetriever(p, i),
  }));

  const missingValueIndex = parts.findIndex((p) => p.value === undefined);

  return {
    type: keyPart.type,
    fields: keyPart.fields,
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

/**
 * Generate deterministic properties of the entity key for partition and optional sort keys.
 */
export function normalizeEntityKeyDefinition(
  entity: AnyEntity
): NormalizedEntityKeyDefinition {
  const entityZodShape = entity.attributes.shape;

  return {
    partition: formatNormalizedDefinition(entity.partition),
    sort: entity.sort ? formatNormalizedDefinition(entity.sort) : undefined,
  };

  function formatNormalizedDefinition(
    keyField: EntityCompositeKeyPart<any>
  ): NormalizedEntityKeyDefinitionPart {
    const [head, ...tail] = keyField;

    if (!head) {
      throw new Error(
        "Entity Key Part must contain at least one segment. Sort Key maybe undefined."
      );
    }

    // the value will be a number if there is a single part to the composite key part and the value is already a number.
    // else a string will be formatted
    const type =
      tail.length === 0 && entityZodShape[head] instanceof z.ZodNumber
        ? "number"
        : "string";

    const attribute = keyField.join("|");

    return {
      type,
      keyAttribute: attribute,
      fields: keyField,
    };
  }
}

export function normalizeEntitySpecKeyDefinition(
  entity: EntitySpec
): NormalizedEntityKeyDefinition {
  const entityZodShape = entity.attributes;

  return {
    partition: formatNormalizedDefinition(entity.partition),
    sort: entity.sort ? formatNormalizedDefinition(entity.sort) : undefined,
  };

  function formatNormalizedDefinition(
    keyField: EntityCompositeKeyPart<any>
  ): NormalizedEntityKeyDefinitionPart {
    const [head, ...tail] = keyField;

    if (!head) {
      throw new Error(
        "Entity Key Part must contain at least one segment. Sort Key may be undefined."
      );
    }

    // the value will be a number if there is a single part to the composite key part and the value is already a number.
    // else a string will be formatted
    const type =
      tail.length === 0 &&
      (entityZodShape.properties?.[head] as openapi.SchemaObject).type ===
        "number"
        ? "number"
        : "string";

    const attribute = keyField.join("|");

    return {
      type,
      keyAttribute: attribute,
      fields: keyField,
    };
  }
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
