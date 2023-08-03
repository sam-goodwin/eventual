import {
  Attributes,
  BetweenProgressiveKeyCondition,
  BetweenQueryKeyCondition,
  CompositeKey,
  Entity,
  EntityConsistencyOptions,
  EntityIndex,
  EntityQueryOptions,
  EntityQueryResult,
  EntityReadOptions,
  EntityScanOptions,
  EntityPutOptions,
  EntityTransactItem,
  EntityWithMetadata,
  KeyMap,
  KeyValue,
  QueryKey,
  QueryKeyCondition,
  QueryKeyMap,
} from "@eventual/core";
import {
  EntityHook,
  KeyDefinition,
  KeyDefinitionPart,
  assertNever,
  isBeginsWithQueryKeyCondition,
  isBetweenQueryKeyCondition,
  isGreaterThanEqualsQueryKeyCondition,
  isGreaterThanQueryKeyCondition,
  isLessThanEqualsQueryKeyCondition,
  isLessThanQueryKeyCondition,
  keyHasInlineBetween,
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

  public put(
    entityName: string,
    value: Attributes,
    options?: EntityPutOptions
  ): Promise<{ version: number }> {
    const entity = this.getEntity(entityName);
    const normalizedKey = normalizeCompositeKey(entity, value);

    if (!isCompleteKey(normalizedKey)) {
      throw new Error("Key cannot be partial for set.");
    }

    return this._put(entity, value, normalizedKey, options);
  }

  protected abstract _put(
    entity: Entity,
    value: Attributes,
    key: NormalizedEntityCompositeKeyComplete,
    options?: EntityPutOptions
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
    queryKey: QueryKey<any, any, any>,
    options?: EntityQueryOptions<any, any>
  ): Promise<EntityQueryResult> {
    const entity = this.getEntity(entityName);
    const normalizedKey = normalizeCompositeQueryKey(entity, queryKey);

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
    queryKey: QueryKey<any, any, any>,
    options?: EntityQueryOptions
  ): Promise<EntityQueryResult> {
    const index = this.getEntity(entityName).indices.find(
      (i) => i.name === indexName
    );

    if (!index) {
      throw new Error(
        `Index ${indexName} was not found on entity ${entityName}`
      );
    }

    const normalizedKey = normalizeCompositeQueryKey(index.key, queryKey);

    if (!isCompleteKeyPart(normalizedKey.partition)) {
      throw new Error(
        "Entity Index partition key cannot be partial for query."
      );
    }

    return this._query(index, normalizedKey, options);
  }

  protected abstract _query(
    entity: Entity | EntityIndex,
    queryKey: NormalizedEntityCompositeQueryKey,
    options: EntityQueryOptions | undefined
  ): Promise<EntityQueryResult>;

  public scan(
    entityName: string,
    options?: EntityScanOptions<any, any>
  ): Promise<EntityQueryResult> {
    const entity = this.getEntity(entityName);

    return this._scan(entity, options);
  }

  public scanIndex(
    entityName: string,
    indexName: string,
    options?: EntityScanOptions | undefined
  ): Promise<EntityQueryResult> {
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
    options: EntityScanOptions | undefined
  ): Promise<EntityQueryResult>;

  public async transactWrite(items: EntityTransactItem[]): Promise<void> {
    return this._transactWrite(
      items.map((item): NormalizedEntityTransactItem => {
        const entity =
          typeof item.entity === "string"
            ? this.getEntity(item.entity)
            : item.entity;
        const keyValue = item.operation === "put" ? item.value : item.key;
        const key = normalizeCompositeKey(entity, keyValue);
        if (!isCompleteKey(key)) {
          throw new Error(
            "Entity key cannot be partial for set, delete, or condition operations."
          );
        }

        return item.operation === "put"
          ? {
              operation: "put",
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
      operation: "put";
      value: Attributes;
      options?: EntityPutOptions;
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

export interface NormalizedEntityKeyPartBase<Value> extends KeyDefinitionPart {
  parts: { field: string; value?: Value }[];
}

export type NormalizedEntityKeyPart =
  | NormalizedEntityKeyPartialPart
  | NormalizedEntityKeyCompletePart;

export type NormalizedEntityQueryKeyPart =
  | NormalizedEntityKeyPartialPart<KeyValue | QueryKeyCondition>
  | NormalizedEntityKeyCompletePart<KeyValue | QueryKeyCondition>
  | NormalizedEntityQueryKeyConditionPart;

export interface NormalizedEntityKeyCompletePart<Value = KeyValue>
  extends NormalizedEntityKeyPartBase<Value> {
  keyValue: KeyValue;
  partialValue: false;
}

export interface NormalizedEntityKeyPartialPart<Value = KeyValue>
  extends NormalizedEntityKeyPartBase<Value> {
  keyValue?: KeyValue;
  partialValue: true;
}

/**
 * A query key that has been normalized.
 */
export interface NormalizedEntityQueryKeyConditionPart
  extends NormalizedEntityKeyPartBase<KeyValue | QueryKeyCondition> {
  /**
   * The condition given by the user, but updated with the given key prefix if present.
   *
   * ```ts
   * {
   *   "sortA": "A",
   *   "sortB": { between: ["B", "C"] }
   * }
   * ```
   *
   * Outputs as:
   *
   * ```ts
   * {
   *   condition: { between: ["A#B", "A#C"] }
   * }
   * ```
   */
  condition: QueryKeyCondition;
}

export function isNormalizedEntityQueryKeyConditionPart(
  key: NormalizedEntityQueryKeyPart
): key is NormalizedEntityQueryKeyConditionPart {
  return !!(key as NormalizedEntityQueryKeyConditionPart).condition;
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
  Sort extends
    | NormalizedEntityKeyPart
    | NormalizedEntityQueryKeyPart = NormalizedEntityKeyPart
> {
  partition: Partition;
  sort?: Sort;
}

/**
 * A composite key that is complete. Both the partition and sort keys have all attributes present.
 */
export type NormalizedEntityCompositeKeyComplete = NormalizedEntityCompositeKey<
  NormalizedEntityKeyCompletePart,
  NormalizedEntityKeyCompletePart
>;

/**
 * A composite key that can be used for queries. The partition key must be complete, but the sort key can be partial or a condition.
 */
export type NormalizedEntityCompositeQueryKey = NormalizedEntityCompositeKey<
  NormalizedEntityKeyCompletePart,
  NormalizedEntityQueryKeyPart
>;

/**
 * Generate properties for an entity key given the key definition and key values.
 */
export function normalizeCompositeKey<E extends Entity>(
  entity: E | KeyDefinition,
  key: Partial<CompositeKey>
): NormalizedEntityCompositeKey {
  const keyDef = "partition" in entity ? entity : entity.key;

  const partitionCompositeKey = formatNormalizePartitionKeyPart(keyDef, key);

  const sortCompositeKey = formatNormalizeSortKeyPart(keyDef, key);

  return sortCompositeKey
    ? {
        partition: partitionCompositeKey,
        sort: sortCompositeKey,
      }
    : {
        partition: partitionCompositeKey,
      };
}

/**
 * Generate properties for an entity query key given the key definition and key values or conditions.
 */
export function normalizeCompositeQueryKey<E extends Entity>(
  entity: E | KeyDefinition,
  key: QueryKey<any, any, any>
): NormalizedEntityCompositeQueryKey {
  const keyDef = "partition" in entity ? entity : entity.key;

  const partitionCompositeKey = formatNormalizePartitionKeyPart(keyDef, key);

  if (partitionCompositeKey.partialValue) {
    throw new Error("Query key partition part cannot be partial");
  }

  const sortCompositeKey = keyDef.sort
    ? formatNormalizedQueryPart(
        keyDef as KeyDefinition & { sort: KeyDefinitionPart },
        key
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
  valueRetriever: (field: string, index: number) => KeyValue | undefined
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

function formatNormalizePartitionKeyPart(
  keyDef: KeyDefinition,
  key: Partial<CompositeKey> | QueryKey<any, any, any>
) {
  return formatNormalizedPart(keyDef.partition, (p, i) => {
    const value = Array.isArray(key) ? key[i] : (key as KeyMap)[p];
    if (typeof value === "object") {
      throw new Error(`Partition Key value must be a string or number: ${p}`);
    }
    return value;
  });
}

function formatNormalizeSortKeyPart(
  keyDef: KeyDefinition,
  key: Partial<CompositeKey> | QueryKey<any, any, any>
) {
  if (!keyDef.sort) {
    return undefined;
  }
  return formatNormalizedPart(keyDef.sort, (p, i) =>
    Array.isArray(key)
      ? key[keyDef.partition.attributes.length + i]
      : (key as KeyMap)[p]
  );
}

function formatNormalizedQueryPart(
  keyDef: KeyDefinition & { sort: KeyDefinitionPart },
  key: QueryKey<any, any, any>
): NormalizedEntityQueryKeyPart {
  const keyPart = keyDef.sort;
  const parts = keyPart.attributes.map((p, i) => ({
    field: p,
    value: Array.isArray(key)
      ? key[keyDef.partition.attributes.length + i]
      : (key as QueryKeyMap)[p],
  }));

  const queryConditionIndex = parts.findIndex(
    (p) => typeof p.value === "object"
  );
  const missingValueIndex = parts.findIndex((p) => p.value === undefined);

  const isPartial = missingValueIndex > -1;
  const hasInlineBetweenCondition = keyHasInlineBetween(key);
  const hasFieldCondition = queryConditionIndex > -1;

  /**
   * The key condition must be the last given value and there be at most one condition.
   *
   * [condition] - valid
   * [value] - valid
   * [value, missing] - valid
   * [value, condition] - valid
   * [value, condition, missing] - valid
   * [value, condition, value | condition] - invalid
   * [missing, value | condition] - invalid
   */
  if (
    hasFieldCondition &&
    ((isPartial && queryConditionIndex > missingValueIndex) ||
      queryConditionIndex !== keyPart.attributes.length - 1)
  ) {
    throw new Error(
      "Query Key condition must be the final value provided key attribute."
    );
  }

  if (hasInlineBetweenCondition && hasFieldCondition) {
    throw new Error(
      "Query key cannot contain a key condition and an inline $between condition."
    );
  }

  const hasCondition = hasFieldCondition || hasInlineBetweenCondition;

  const lastIndex = isPartial
    ? hasFieldCondition
      ? Math.min(missingValueIndex, queryConditionIndex)
      : missingValueIndex
    : hasFieldCondition
    ? queryConditionIndex
    : parts.length;

  const keyValuePrefix =
    lastIndex === 0 // if there are no present values, return undefined
      ? undefined
      : keyPart.type === "number"
      ? (parts[0]!.value as KeyValue)
      : parts
          .slice(0, lastIndex)
          .map((p) => p.value)
          .join("#");

  if (hasCondition) {
    const condition = hasInlineBetweenCondition
      ? // turns the inline between into a normal between condition. We'll append the key value prefix next.
        generateBetweenConditionFromInlineBetween(
          key,
          keyDef,
          // there should not be both a condition key and the inline $between condition
          isPartial ? missingValueIndex : 0
        )
      : (parts[queryConditionIndex]?.value as QueryKeyCondition);

    return {
      type: keyPart.type,
      attributes: keyPart.attributes,
      parts,
      // this can never be a number, either there is a condition on a > 0 index attribute or the number is the first
      keyAttribute: keyPart.keyAttribute,
      condition: isBetweenQueryKeyCondition(condition)
        ? {
            $between: [
              formatKeyPrefixConditionValue(
                condition.$between[0],
                keyValuePrefix
              ),
              formatKeyPrefixConditionValue(
                condition.$between[1],
                keyValuePrefix
              ),
            ],
          }
        : isBeginsWithQueryKeyCondition(condition)
        ? {
            $beginsWith: formatKeyPrefixConditionValue(
              condition.$beginsWith,
              keyValuePrefix
            ) as string,
          }
        : isLessThanQueryKeyCondition(condition)
        ? {
            $lt: formatKeyPrefixConditionValue(condition.$lt, keyValuePrefix),
          }
        : isLessThanEqualsQueryKeyCondition(condition)
        ? {
            $lte: formatKeyPrefixConditionValue(condition.$lte, keyValuePrefix),
          }
        : isGreaterThanQueryKeyCondition(condition)
        ? {
            $gt: formatKeyPrefixConditionValue(condition.$gt, keyValuePrefix),
          }
        : isGreaterThanEqualsQueryKeyCondition(condition)
        ? {
            $gte: formatKeyPrefixConditionValue(condition.$gte, keyValuePrefix),
          }
        : assertNever(condition),
    };
  }

  return {
    type: keyPart.type,
    attributes: keyPart.attributes,
    parts,
    keyAttribute: keyPart.keyAttribute,
    keyValue: keyValuePrefix,
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
 * Removes any key attributes found in the entity key or index keys.
 */
export function removeKeyAttributes(
  entity: Entity,
  value: Attributes,
  filter?: (part: KeyDefinitionPart) => boolean,
  excludeIndices = false,
  mutate = false
): Attributes {
  const keysToDelete = new Set(
    [entity.key, ...(excludeIndices ? [] : entity.indices.map((k) => k.key))]
      .flatMap((k) => (k.sort ? [k.partition, k.sort] : [k.partition]))
      .filter((k) => (filter ? filter(k) : true))
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

function formatKeyPrefixConditionValue(
  conditionValue: KeyValue,
  prefixValue?: KeyValue
) {
  return prefixValue !== undefined
    ? `${prefixValue.toString()}#${conditionValue.toString()}`
    : conditionValue;
}

function generateBetweenConditionFromInlineBetween(
  condition: BetweenProgressiveKeyCondition<any, any>,
  keyDefinition: KeyDefinition & { sort: KeyDefinitionPart },
  sortKeyOffset: number
): BetweenQueryKeyCondition {
  const betweenKeyPart: KeyDefinitionPart = {
    attributes: keyDefinition.sort.attributes.slice(sortKeyOffset),
    keyAttribute: keyDefinition.sort.keyAttribute,
    type: keyDefinition.sort.type,
  };
  const left = formatNormalizedPart(betweenKeyPart, (p) => {
    return (condition.$between[0] as KeyMap)[p];
  });
  const right = formatNormalizedPart(betweenKeyPart, (p) => {
    return (condition.$between[1] as KeyMap)[p];
  });
  if (
    keyDefinition.sort.type === "number" &&
    (left.keyValue === undefined || right.keyValue === undefined)
  ) {
    throw new Error(
      "Between conditions cannot be empty when the field type is number."
    );
  }
  return { $between: [left.keyValue ?? "", right.keyValue ?? ""] };
}
