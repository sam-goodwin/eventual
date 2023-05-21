import type {
  Attributes,
  CompositeKey,
  Entity,
  EntityConsistencyOptions,
  EntityIndex,
  EntityQueryOptions,
  EntityQueryResult,
  EntityReadOptions,
  EntitySetOptions,
  EntityTransactItem,
  EntityWithMetadata,
  KeyMap,
  KeyValue,
  QueryKey,
} from "@eventual/core";
import type {
  EntityHook,
  KeyDefinition,
  KeyDefinitionPart,
} from "@eventual/core/internal";
import { EntityProvider } from "../providers/entity-provider.js";

export abstract class EntityStore implements EntityHook {
  constructor(private entityProvider: EntityProvider) {}

  public async get(entityName: string, key: CompositeKey): Promise<any> {
    return (await this.getWithMetadata(entityName, key))?.value;
  }

  public async getWithMetadata(
    entityName: string,
    key: CompositeKey,
    options?: EntityReadOptions
  ): Promise<EntityWithMetadata | undefined> {
    const entity = this.getEntity(entityName);
    const normalizedCompositeKey = normalizeCompositeKey(entity, key);

    if (!isCompleteKey(normalizedCompositeKey)) {
      throw new Error("Key cannot be partial for get or getWithMetadata.");
    }

    return this._getWithMetadata(entity, normalizedCompositeKey, options);
  }

  protected abstract _getWithMetadata(
    entity: Entity,
    key: NormalizedEntityCompositeKeyComplete,
    options?: EntityReadOptions
  ): Promise<EntityWithMetadata | undefined>;

  public set(
    entityName: string,
    value: Attributes,
    options?: EntitySetOptions
  ): Promise<{ version: number }> {
    const entity = this.getEntity(entityName);
    const normalizedKey = normalizeCompositeKey(entity, value);

    if (!isCompleteKey(normalizedKey)) {
      throw new Error("Key cannot be partial for set.");
    }

    return this._set(entity, value, normalizedKey, options);
  }

  protected abstract _set(
    entity: Entity,
    value: Attributes,
    key: NormalizedEntityCompositeKeyComplete,
    options?: EntitySetOptions
  ): Promise<{ version: number }>;

  public delete(
    entityName: string,
    key: CompositeKey,
    options?: EntityConsistencyOptions | undefined
  ): Promise<void> {
    const entity = this.getEntity(entityName);
    const normalizedKey = normalizeCompositeKey(entity, key);

    if (!isCompleteKey(normalizedKey)) {
      throw new Error("Key cannot be partial for delete.");
    }

    return this._delete(entity, normalizedKey, options);
  }

  protected abstract _delete(
    entity: Entity,
    key: NormalizedEntityCompositeKeyComplete,
    options?: EntityConsistencyOptions | undefined
  ): Promise<void>;

  public query(
    entityName: string,
    queryKey: QueryKey,
    options?: EntityQueryOptions | undefined
  ): Promise<EntityQueryResult> {
    const entity = this.getEntity(entityName);
    const normalizedKey = normalizeCompositeKey(entity, queryKey);

    if (!isCompleteKeyPart(normalizedKey.partition)) {
      throw new Error("Entity partition key cannot be partial for query");
    }

    return this._query(
      entity,
      normalizedKey as NormalizedEntityCompositeKey<NormalizedEntityKeyCompletePart>,
      options
    );
  }

  public queryIndex(
    entityName: string,
    indexName: string,
    queryKey: QueryKey,
    options?: EntityQueryOptions | undefined
  ): Promise<EntityQueryOptions> {
    const index = this.getEntity(entityName).indices.find(
      (i) => i.name === indexName
    );

    if (!index) {
      throw new Error(
        `Index ${indexName} was not found on entity ${entityName}`
      );
    }

    const normalizedKey = normalizeCompositeKey(index.key, queryKey);

    if (!isCompleteKeyPart(normalizedKey.partition)) {
      throw new Error(
        "Entity Index partition key cannot be partial for query."
      );
    }

    return this._query(
      index,
      normalizedKey as NormalizedEntityCompositeKey<NormalizedEntityKeyCompletePart>,
      options
    );
  }

  protected abstract _query(
    entity: Entity | EntityIndex,
    queryKey: NormalizedEntityCompositeKey<NormalizedEntityKeyCompletePart>,
    options: EntityQueryOptions | undefined
  ): Promise<EntityQueryResult>;

  public scan(
    entityName: string,
    options?: EntityQueryOptions | undefined
  ): Promise<EntityQueryResult> {
    const entity = this.getEntity(entityName);

    return this._scan(entity, options);
  }

  public scanIndex(
    entityName: string,
    indexName: string,
    options?: EntityQueryOptions | undefined
  ): Promise<EntityQueryOptions> {
    const index = this.getEntity(entityName).indices.find(
      (i) => i.name === indexName
    );

    if (!index) {
      throw new Error(
        `Index ${indexName} was not found on entity ${entityName}`
      );
    }

    return this._scan(index, options);
  }

  protected abstract _scan(
    entity: Entity | EntityIndex,
    options: EntityQueryOptions | undefined
  ): Promise<EntityQueryResult>;

  public async transactWrite(items: EntityTransactItem[]): Promise<void> {
    return this._transactWrite(
      items.map((item): NormalizedEntityTransactItem => {
        const entity =
          typeof item.entity === "string"
            ? this.getEntity(item.entity)
            : item.entity;
        const keyValue = item.operation === "set" ? item.value : item.key;
        const key = normalizeCompositeKey(entity, keyValue);
        if (!isCompleteKey(key)) {
          throw new Error(
            "Entity key cannot be partial for set, delete, or condition operations."
          );
        }

        return item.operation === "set"
          ? {
              operation: "set",
              entity,
              key,
              value: item.value,
              options: item.options,
            }
          : item.operation === "delete"
          ? {
              operation: "delete",
              entity,
              key,
              options: item.options,
            }
          : {
              operation: "condition",
              entity,
              key,
              version: item.version,
            };
      })
    );
  }

  protected abstract _transactWrite(
    items: NormalizedEntityTransactItem[]
  ): Promise<void>;

  protected getEntity(entityName: string) {
    const entity = this.entityProvider.getEntity(entityName);

    if (!entity) {
      throw new Error(`Entity ${entityName} was not found.`);
    }
    return entity;
  }
}

export type NormalizedEntityTransactItem = {
  entity: Entity;
  key: NormalizedEntityCompositeKeyComplete;
} & (
  | {
      operation: "set";
      value: Attributes;
      options?: EntitySetOptions;
    }
  | {
      operation: "delete";
      options?: EntityConsistencyOptions;
    }
  | {
      operation: "condition";
      version?: number;
    }
);

export interface NormalizedEntityKeyPartBase extends KeyDefinitionPart {
  parts: { field: string; value: KeyValue }[];
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

export type NormalizedEntityCompositeKeyComplete = NormalizedEntityCompositeKey<
  NormalizedEntityKeyCompletePart,
  NormalizedEntityKeyCompletePart
>;

/**
 * Generate properties for an entity key given the key definition and key values.
 */
export function normalizeCompositeKey<E extends Entity>(
  entity: E | KeyDefinition,
  key: Partial<CompositeKey>
): NormalizedEntityCompositeKey {
  const keyDef = "partition" in entity ? entity : entity.key;

  const partitionCompositeKey = formatNormalizedPart(keyDef.partition, (p, i) =>
    Array.isArray(key) ? key[i] : (key as KeyMap)[p]
  );

  const sortCompositeKey = keyDef.sort
    ? formatNormalizedPart(keyDef.sort, (p, i) =>
        Array.isArray(key)
          ? key[keyDef.partition.attributes.length + i]
          : (key as KeyMap)[p]
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
  keyPart: KeyDefinitionPart,
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
    keyValue:
      // if there are no present values, return undefined
      missingValueIndex === 0
        ? undefined
        : keyPart.type === "number"
        ? parts[0]!.value
        : (missingValueIndex === -1 ? parts : parts.slice(0, missingValueIndex))
            .map((p) => p.value)
            .join("#"),
    // since true is more permissive (allows undefined), hack the types here to allow any value
    partialValue: (missingValueIndex !== -1) as true,
  };
}

export function convertNormalizedEntityKeyToMap(
  key: NormalizedEntityCompositeKey
): KeyMap<any, any, any> {
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

/**
 * Returns the generated key attributes.
 *
 * If a generated key attribute contains any undefined values, they key value is considered partial and not generated.
 * In this case, the item will not appear in the applicable indices.
 */
export function computeGeneratedIndexKeyAttributes(
  entity: Entity,
  value: Attributes
): Attributes {
  return Object.fromEntries(
    entity.indices
      .flatMap((i) => {
        const { partition, sort } = normalizeCompositeKey(i.key, value);
        return sort ? [partition, sort] : [partition];
      })
      // only take attributes that need to be computed
      .filter((k) => k.attributes.length > 1)
      // only support complete keys
      .filter(isCompleteKeyPart)
      .map((k) => [k.keyAttribute, k.keyValue] as const)
  );
}

/**
 * Removes any generated key attributes found in the entity key or index keys.
 *
 * Attributes are generated for multi-attribute keys.
 */
export function removeGeneratedKeyAttributes(
  entity: Entity,
  value: Attributes,
  excludeIndices = false,
  mutate = false
): Attributes {
  return removeKeyAttributes(
    entity,
    value,
    (k) => k.attributes.length > 1,
    excludeIndices,
    mutate
  );
}

/**
 * Removes any original key attributes found in the entity key or index keys.
 *
 * Original attributes may be re-used for single-attribute keys.
 */
export function removeOriginalKeyAttributes(
  entity: Entity,
  value: Attributes,
  excludeIndices = false,
  mutate = false
): Attributes {
  return removeKeyAttributes(
    entity,
    value,
    (k) => k.attributes.length === 1,
    excludeIndices,
    mutate
  );
}

function removeKeyAttributes(
  entity: Entity,
  value: Attributes,
  filter: (part: KeyDefinitionPart) => boolean,
  excludeIndices = false,
  mutate = false
): Attributes {
  const keysToDelete = new Set(
    [entity.key, ...(excludeIndices ? [] : entity.indices.map((k) => k.key))]
      .flatMap((k) => (k.sort ? [k.partition, k.sort] : [k.partition]))
      .filter(filter)
      .map((k) => k.keyAttribute)
  );

  if (mutate) {
    // If we can mutate, delete any of the selected attributes.
    keysToDelete.forEach((a) => delete value[a]);
    return value;
  } else {
    // If we can mutate, delete any of the selected attributes.
    return Object.fromEntries(
      Object.entries(value).filter(
        ([attribute]) => !keysToDelete.has(attribute)
      )
    );
  }
}
