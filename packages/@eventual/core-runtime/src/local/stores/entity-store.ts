import {
  Attributes,
  Entity,
  EntityConsistencyOptions,
  EntityIndex,
  EntityQueryOptions,
  EntityQueryResult,
  EntityScanOptions,
  EntitySetOptions,
  EntityStreamItem,
  EntityWithMetadata,
  KeyValue,
  TransactionCancelled,
  UnexpectedVersion,
} from "@eventual/core";
import {
  KeyDefinition,
  assertNever,
  isBeginsWithQueryKeyCondition,
  isBetweenQueryKeyCondition,
  isGreaterThanEqualsQueryKeyCondition,
  isGreaterThanQueryKeyCondition,
  isLessThanEqualsQueryKeyCondition,
  isLessThanQueryKeyCondition,
} from "@eventual/core/internal";
import { EntityProvider } from "../../providers/entity-provider.js";
import {
  EntityStore,
  NormalizedEntityCompositeKeyComplete,
  NormalizedEntityCompositeQueryKey,
  NormalizedEntityKeyCompletePart,
  NormalizedEntityQueryKeyPart,
  NormalizedEntityTransactItem,
  convertNormalizedEntityKeyToMap,
  isCompleteKey,
  isNormalizedEntityQueryKeyConditionPart,
  normalizeCompositeKey,
} from "../../stores/entity-store.js";
import { deserializeCompositeKey, serializeCompositeKey } from "../../utils.js";
import { LocalEnvConnector } from "../local-container.js";
import { paginateItems } from "./pagination.js";

type PK = KeyValue;
type SK = KeyValue;

export type TableMap = Map<PK, TablePartition>;
export type TablePartition = Map<SK, EntityWithMetadata>;

export interface LocalEntityStoreProps {
  localConnector: LocalEnvConnector;
  entityProvider: EntityProvider;
}

export interface LocalEntity {
  data: TableMap;
  indices: Record<string, TableMap>;
}

export class LocalEntityStore extends EntityStore {
  private entities: Record<string, LocalEntity> = {};

  constructor(private props: LocalEntityStoreProps) {
    super(props.entityProvider);
  }

  protected override async _getWithMetadata(
    entity: Entity,
    key: NormalizedEntityCompositeKeyComplete
  ): Promise<EntityWithMetadata | undefined> {
    const item = this.getPartitionMap(entity, key.partition).get(
      skOrDefault(key)
    );
    if (item instanceof Map) {
      throw new Error(`Cannot call 'getWithMetadata' on an index`);
    }
    return item;
  }

  protected override async _set(
    entity: Entity,
    value: Attributes,
    key: NormalizedEntityCompositeKeyComplete,
    options?: EntitySetOptions
  ): Promise<{ version: number }> {
    const { version = 0, value: oldValue } =
      (await this._getWithMetadata(entity, key)) ?? {};
    if (
      options?.expectedVersion !== undefined &&
      options.expectedVersion !== version
    ) {
      throw new Error(
        `Expected entity to be of version ${options.expectedVersion} but found ${version}`
      );
    }
    const newVersion =
      options?.incrementVersion === false ? version : version + 1;

    const newValue = {
      value,
      version: newVersion,
    };

    setLocalEntity(this.getLocalEntity(entity), newValue, key, entity);

    this.props.localConnector.pushWorkflowTask({
      kind: "EntityStreamEvent",
      entityName: entity.name,
      item: {
        key: convertNormalizedEntityKeyToMap(key),
        operation: version === 0 ? ("insert" as const) : ("modify" as const),
        newValue: value,
        newVersion,
        oldValue,
        oldVersion: version,
      } as EntityStreamItem,
    });
    return { version: newVersion };
  }

  protected override async _delete(
    entity: Entity,
    key: NormalizedEntityCompositeKeyComplete,
    options?: EntityConsistencyOptions | undefined
  ): Promise<void> {
    const item = await this._getWithMetadata(entity, key);
    if (item) {
      if (options?.expectedVersion !== undefined) {
        if (options.expectedVersion !== item.version) {
          throw new UnexpectedVersion("Unexpected Version");
        }
      }

      if (deleteLocalEntity(this.getLocalEntity(entity), key, entity)) {
        this.props.localConnector.pushWorkflowTask({
          kind: "EntityStreamEvent",
          entityName: entity.name,
          item: {
            key: convertNormalizedEntityKeyToMap(key),
            operation: "remove" as const,
            oldValue: item.value,
            oldVersion: item.version,
          } as EntityStreamItem,
        });
      }
    }
  }

  protected override async _query(
    entityOrIndex: Entity | EntityIndex,
    queryKey: NormalizedEntityCompositeQueryKey,
    options?: EntityQueryOptions
  ): Promise<EntityQueryResult> {
    const partition = this.getPartitionMap(entityOrIndex, queryKey.partition);

    const entries = partition
      ? [...(partition as TablePartition).entries()]
      : [];

    const sortKeyPart = queryKey.sort;
    const sortFilteredEntries = sortKeyPart
      ? entries.filter((e) =>
          filterEntryBySortKey(entityOrIndex.key, sortKeyPart, e[1].value)
        )
      : entries;

    const { items, nextToken } = paginateItems(
      sortFilteredEntries,
      (a, b) => {
        const ord = sortBySortKey(entityOrIndex.key, a[1].value, b[1].value);
        if (ord === 0 && entityOrIndex.kind === "EntityIndex") {
          const source = this.getEntity(entityOrIndex.entityName);
          if (!source) {
            throw new Error(`Entity ${entityOrIndex.entityName} not found`);
          }
          // if they are equal and this is an Index, sort by the table's PK/SK to ensure consistent ordering
          return sortBySortKey(source.key, a[1].value, b[1].value);
        }
        return ord;
      },
      undefined,
      options?.direction,
      options?.limit,
      options?.nextToken
    );

    function sortBySortKey(
      keyDef: KeyDefinition,
      a: Attributes,
      b: Attributes
    ) {
      const aKey = normalizeCompositeKey(keyDef, a);
      const aSortKeyValue = aKey.sort?.keyValue;
      const bKey = normalizeCompositeKey(keyDef, b);
      const bSortKeyValue = bKey.sort?.keyValue;

      if (typeof aSortKeyValue === "string") {
        return aSortKeyValue.localeCompare(bSortKeyValue as string);
      } else {
        return (aSortKeyValue as number) - (bSortKeyValue as number);
      }
    }

    // values should be sorted
    return {
      entries: items?.map(
        ([, value]) =>
          ({
            value: value.value,
            version: value.version,
          } satisfies EntityWithMetadata)
      ),
      nextToken,
    };
  }

  /**
   * Attempts to match dynamo's scan behavior. Scan is "unordered".
   */
  protected override async _scan(
    entity: Entity | EntityIndex,
    options?: EntityScanOptions
  ): Promise<EntityQueryResult> {
    const store = this.getLocalEntityStore(entity);
    if (!store) {
      return {
        entries: [],
        nextToken: undefined,
      };
    }

    const entries = [...((store as TableMap).values() ?? [])].flatMap((val) => [
      ...val.values(),
    ]);

    const { items, nextToken } = paginateItems(
      entries,
      undefined,
      undefined,
      undefined,
      options?.limit,
      options?.nextToken
    );

    // values should be sorted
    return {
      entries: items,
      nextToken,
    };
  }

  protected override async _transactWrite(
    items: NormalizedEntityTransactItem[]
  ): Promise<void> {
    const keysAndVersions = Object.fromEntries(
      items.map((item) => {
        return [
          serializeCompositeKey(item.entity.name, item.key),
          item.operation === "condition"
            ? item.version
            : item.options?.expectedVersion,
        ] as const;
      })
    );
    /**
     * Evaluate the expected versions against the current state and return the results.
     *
     * This is similar to calling TransactWriteItem in dynamo with only ConditionChecks and then
     * handling the errors.
     */
    const consistencyResults = await Promise.all(
      Object.entries(keysAndVersions).map(async ([sKey, expectedVersion]) => {
        if (expectedVersion === undefined) {
          return true;
        }
        const [entityName, key] = deserializeCompositeKey(sKey);
        const { version } = (await this.getWithMetadata(entityName, key)) ?? {
          version: 0,
        };
        return version === expectedVersion;
      })
    );
    if (consistencyResults.some((r) => !r)) {
      throw new TransactionCancelled(
        consistencyResults.map((r) =>
          r ? undefined : new UnexpectedVersion("Unexpected Version")
        )
      );
    }
    /**
     * After ensuring that all of the expected versions are accurate, actually perform the writes.
     * Here we assume that the write operations are synchronous and that
     * the state of the condition checks will not be invalided.
     */
    await Promise.all(
      items.map(async (item) => {
        if (item.operation === "set") {
          return await this._set(
            item.entity,
            item.value,
            item.key,
            item.options
          );
        } else if (item.operation === "delete") {
          return await this._delete(item.entity, item.key, item.options);
        } else if (item.operation === "condition") {
          // no op
          return;
        }
        return assertNever(item);
      })
    );
  }

  private getLocalEntity(entityOrIndex: Entity | EntityIndex) {
    const entity =
      entityOrIndex.kind === "Entity"
        ? entityOrIndex
        : this.getEntity(entityOrIndex.entityName);
    const _entity = (this.entities[entity.name] ??=
      initializeLocalEntity(entity));
    return _entity;
  }

  private getLocalEntityStore(entityOrIndex: Entity | EntityIndex) {
    const localEntity = this.getLocalEntity(entityOrIndex);
    return entityOrIndex.kind === "EntityIndex"
      ? localEntity.indices[entityOrIndex.name]
      : localEntity.data;
  }

  private getPartitionMap(
    entityOrIndex: Entity | EntityIndex,
    partitionKey: NormalizedEntityKeyCompletePart
  ): TablePartition {
    const table = this.getLocalEntityStore(entityOrIndex);
    if (!table) {
      throw new Error(`Table or Index ${entityOrIndex?.name} not found`);
    }
    let partitionMap: TablePartition | undefined = table.get(
      partitionKey.keyValue
    );
    if (!partitionMap) {
      partitionMap = new Map();
      table.set(partitionKey.keyValue, partitionMap as any);
    }
    return partitionMap;
  }
}

function initializeLocalEntity(entity: Entity): LocalEntity {
  return {
    data: new Map(),
    indices: Object.fromEntries(entity.indices.map((i) => [i.name, new Map()])),
  };
}

function setLocalEntity(
  localEntity: LocalEntity,
  value: EntityWithMetadata,
  key: NormalizedEntityCompositeKeyComplete,
  entity: Entity
) {
  const oldValue = getPartitionEntry(localEntity.data, key);
  updatePartitionEntry(localEntity.data, key, value);

  entity.indices.forEach((i) => {
    const localIndex = localEntity.indices[i.name];
    if (!localIndex) {
      return;
    }
    const normalizedKey = normalizeCompositeKey(i.key, value.value);

    if (oldValue) {
      // if the value existed before, try to delete it from the index.
      const oldKey = normalizeCompositeKey(i.key, oldValue.value);
      if (isCompleteKey(oldKey)) {
        deleteIndexPartitionEntry(localIndex, key, oldKey);
      }
    }

    // if the key isn't complete (missing parts of the index composite key), ignore this item
    if (isCompleteKey(normalizedKey)) {
      updateIndexPartitionEntry(localIndex, key, normalizedKey, value);
    }
  });
}

function deleteLocalEntity(
  localEntity: LocalEntity,
  key: NormalizedEntityCompositeKeyComplete,
  entity: Entity
): boolean {
  const value = localEntity.data
    .get(key.partition.keyValue)
    ?.get(skOrDefault(key));

  if (!value) {
    return false;
  }

  const deleted = deletePartitionEntry(localEntity.data, key);

  entity.indices.forEach((i) => {
    const localIndex = localEntity.indices[i.name];
    if (!localIndex) {
      return;
    }
    const normalizedKey = normalizeCompositeKey(i.key, value.value);

    // if the key isn't complete (missing parts of the index composite key), ignore this item
    if (isCompleteKey(normalizedKey)) {
      deleteIndexPartitionEntry(localIndex, key, normalizedKey);
    }
  });

  return deleted;
}

function updatePartitionEntry(
  store: TableMap,
  key: NormalizedEntityCompositeKeyComplete,
  value: EntityWithMetadata
) {
  let partitionMap = store.get(key.partition.keyValue);
  if (!partitionMap) {
    partitionMap = new Map<KeyValue, EntityWithMetadata>();
    store.set(key.partition.keyValue, partitionMap);
  }
  partitionMap.set(skOrDefault(key), value);
}

function updateIndexPartitionEntry(
  store: TableMap,
  tableKey: NormalizedEntityCompositeKeyComplete,
  indexKey: NormalizedEntityCompositeKeyComplete,
  value: EntityWithMetadata
) {
  let partitionMap = store.get(indexKey.partition.keyValue);
  if (!partitionMap) {
    partitionMap = new Map();
    store.set(indexKey.partition.keyValue, partitionMap);
  }

  partitionMap.set(computeUniqueTableIdentifier(tableKey), value);
}

const DEFAULT_SK = "default";

function skOrDefault(key: NormalizedEntityCompositeKeyComplete) {
  return key.sort?.keyValue ?? DEFAULT_SK;
}

// computes a string representing the unique value of a table's PK/SK
// this is used to identify items in an Index that clash with the Index's PK/SK
// the Table PK/SK is guaranteed to be unique, but the Index's is not
function computeUniqueTableIdentifier(
  tableKey: NormalizedEntityCompositeKeyComplete
) {
  return `${tableKey.partition.keyValue}#${tableKey.sort?.keyValue ?? ""}`;
}

function getPartitionEntry(
  store: TableMap,
  key: NormalizedEntityCompositeKeyComplete
) {
  const partitionMap = store.get(key.partition.keyValue);
  if (partitionMap) {
    return partitionMap.get(skOrDefault(key));
  }
  return undefined;
}

function deletePartitionEntry(
  store: TableMap,
  key: NormalizedEntityCompositeKeyComplete
) {
  const partitionMap = store.get(key.partition.keyValue);
  if (partitionMap) {
    return partitionMap.delete(skOrDefault(key));
  }
  return false;
}

function deleteIndexPartitionEntry(
  store: TableMap,
  tableKey: NormalizedEntityCompositeKeyComplete,
  oldKey: NormalizedEntityCompositeKeyComplete
) {
  const partitionMap = store.get(oldKey.partition.keyValue);
  if (partitionMap) {
    return partitionMap.delete(computeUniqueTableIdentifier(tableKey));
  }
  return false;
}

function filterEntryBySortKey(
  keyDef: KeyDefinition,
  querySortKey: NormalizedEntityQueryKeyPart,
  entry: Attributes
) {
  const entryKey = normalizeCompositeKey(keyDef, entry);
  const entrySortKeyValue = entryKey.sort?.keyValue;

  // neither of these should happen, but discard any incomplete values.
  // the item should contain the complete key, including a defined value
  // unless the item is in a sparse index (items don't include the index key attributes),
  // in which case it should not be placed in the index at all
  if (!isCompleteKey(entryKey) || entrySortKeyValue === undefined) {
    return false;
  } else if (isNormalizedEntityQueryKeyConditionPart(querySortKey)) {
    if (isBetweenQueryKeyCondition(querySortKey.condition)) {
      return (
        entrySortKeyValue >= querySortKey.condition.$between[0] &&
        entrySortKeyValue <= querySortKey.condition.$between[1]
      );
    } else if (isBeginsWithQueryKeyCondition(querySortKey.condition)) {
      return typeof entrySortKeyValue === "string"
        ? entrySortKeyValue.startsWith(querySortKey.condition.$beginsWith)
        : false;
    } else if (isLessThanQueryKeyCondition(querySortKey.condition)) {
      return entrySortKeyValue < querySortKey.condition.$lt;
    } else if (isLessThanEqualsQueryKeyCondition(querySortKey.condition)) {
      return entrySortKeyValue <= querySortKey.condition.$lte;
    } else if (isGreaterThanQueryKeyCondition(querySortKey.condition)) {
      return entrySortKeyValue > querySortKey.condition.$gt;
    } else if (isGreaterThanEqualsQueryKeyCondition(querySortKey.condition)) {
      return entrySortKeyValue >= querySortKey.condition.$gte;
    }

    assertNever(querySortKey.condition);
  } else if (querySortKey.keyValue === undefined) {
    return true;
  } else if (
    querySortKey.partialValue &&
    typeof entrySortKeyValue === "string" &&
    typeof querySortKey.keyValue === "string"
  ) {
    return entrySortKeyValue.startsWith(querySortKey.keyValue);
  } else {
    return entrySortKeyValue === querySortKey.keyValue;
  }
}
