import type {
  Entity,
  Attributes,
  CompositeKey,
  EntityConsistencyOptions,
  KeyMap,
  KeyValue,
  QueryKey,
  EntityQueryOptions,
  EntityQueryResult,
  EntitySetOptions,
  EntityTransactItem,
  EntityWithMetadata,
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
    key: CompositeKey
  ): Promise<EntityWithMetadata | undefined> {
    const entity = this.getEntity(entityName);
    const normalizedCompositeKey = normalizeCompositeKey(entity, key);

    if (!isCompleteKey(normalizedCompositeKey)) {
      throw new Error("Key cannot be partial for get or getWithMetadata.");
    }

    return this._getWithMetadata(entity, normalizedCompositeKey);
  }

  protected abstract _getWithMetadata(
    entity: Entity,
    key: NormalizedEntityCompositeKeyComplete
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

  protected abstract _query(
    entity: Entity,
    queryKey: NormalizedEntityCompositeKey<NormalizedEntityKeyCompletePart>,
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
