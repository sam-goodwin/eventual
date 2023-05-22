import {
  Attributes,
  Entity,
  EntityConsistencyOptions,
  EntityIndex,
  EntityQueryOptions,
  EntityQueryResult,
  EntitySetOptions,
  EntityWithMetadata,
  KeyValue,
  TransactionCancelled,
  UnexpectedVersion,
} from "@eventual/core";
import { assertNever } from "@eventual/core/internal";
import { EntityProvider } from "../../providers/entity-provider.js";
import {
  EntityStore,
  NormalizedEntityCompositeKey,
  NormalizedEntityCompositeKeyComplete,
  NormalizedEntityKeyCompletePart,
  NormalizedEntityTransactItem,
  convertNormalizedEntityKeyToMap,
  isCompleteKey,
  normalizeCompositeKey,
} from "../../stores/entity-store.js";
import { deserializeCompositeKey, serializeCompositeKey } from "../../utils.js";
import { LocalEnvConnector } from "../local-container.js";
import { paginateItems } from "./pagination.js";

export interface LocalEntityStoreProps {
  localConnector: LocalEnvConnector;
  entityProvider: EntityProvider;
}

export interface LocalEntity {
  data: Map<KeyValue, Map<KeyValue, EntityWithMetadata>>;
  indices: Record<string, Map<KeyValue, Map<KeyValue, EntityWithMetadata>>>;
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
    return this.getPartitionMap(entity, key.partition).get(
      key.sort?.keyValue ?? "default"
    );
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
      entityName: entity.name,
      key: convertNormalizedEntityKeyToMap(key),
      operation: version === 0 ? ("insert" as const) : ("modify" as const),
      newValue: value,
      newVersion,
      oldValue,
      oldVersion: version,
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
          entityName: entity.name,
          key: convertNormalizedEntityKeyToMap(key),
          operation: "remove" as const,
          oldValue: item.value,
          oldVersion: item.version,
        });
      }
    }
  }

  protected override async _query(
    entity: Entity | EntityIndex,
    queryKey: NormalizedEntityCompositeKey<NormalizedEntityKeyCompletePart>,
    options?: EntityQueryOptions
  ): Promise<EntityQueryResult> {
    const partition = this.getPartitionMap(entity, queryKey.partition);
    const entries = partition ? [...partition.entries()] : [];

    const { items, nextToken } = paginateItems(
      entries,
      (a, b) =>
        typeof a[0] === "string"
          ? a[0].localeCompare(b[0] as string)
          : typeof a[0] === "number"
          ? a[0] - (b[0] as number)
          : 0,
      undefined,
      undefined,
      options?.limit,
      options?.nextToken
    );

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
    options?: EntityQueryOptions
  ): Promise<EntityQueryResult> {
    const store = this.getLocalEntityStore(entity);
    const entries = [...(store?.values() ?? [])].flatMap((val) => [
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
  ) {
    const table = this.getLocalEntityStore(entityOrIndex);
    if (!table) {
      throw new Error(`Table or Index ${entityOrIndex?.name} not found`);
    }
    let partitionMap = table.get(partitionKey.keyValue);
    if (!partitionMap) {
      partitionMap = new Map<KeyValue, EntityWithMetadata>();
      table.set(partitionKey.keyValue, partitionMap);
    }
    return partitionMap;
  }
}

function initializeLocalEntity(entity: Entity): LocalEntity {
  return {
    data: new Map<KeyValue, Map<KeyValue, EntityWithMetadata>>(),
    indices: Object.fromEntries(
      entity.indices.map((i) => [
        i.name,
        new Map<KeyValue, Map<KeyValue, EntityWithMetadata>>(),
      ])
    ),
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

    // if the key isn't complete (missing parts of the index composite key), ignore this item
    if (isCompleteKey(normalizedKey)) {
      updatePartitionEntry(localIndex, normalizedKey, value);
    } else if (oldValue) {
      // if the value existed before, try to delete it from the index.
      const oldKey = normalizeCompositeKey(i.key, oldValue.value);
      if (isCompleteKey(oldKey)) {
        deletePartitionEntry(localIndex, oldKey);
      }
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
    ?.get(key.sort?.keyValue ?? "default");

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
      deletePartitionEntry(localIndex, normalizedKey);
    }
  });

  return deleted;
}

function updatePartitionEntry(
  store: Map<KeyValue, Map<KeyValue, EntityWithMetadata>>,
  key: NormalizedEntityCompositeKeyComplete,
  value: EntityWithMetadata
) {
  let partitionMap = store.get(key.partition.keyValue);
  if (!partitionMap) {
    partitionMap = new Map<KeyValue, EntityWithMetadata>();
    store.set(key.partition.keyValue, partitionMap);
  }
  partitionMap.set(key.sort?.keyValue ?? "default", value);
}

function getPartitionEntry(
  store: Map<KeyValue, Map<KeyValue, EntityWithMetadata>>,
  key: NormalizedEntityCompositeKeyComplete
) {
  const partitionMap = store.get(key.partition.keyValue);
  if (partitionMap) {
    return partitionMap.get(key.sort?.keyValue ?? "default");
  }
  return undefined;
}

function deletePartitionEntry(
  store: Map<KeyValue, Map<KeyValue, EntityWithMetadata>>,
  key: NormalizedEntityCompositeKeyComplete
) {
  const partitionMap = store.get(key.partition.keyValue);
  if (partitionMap) {
    return partitionMap.delete(key.sort?.keyValue ?? "default");
  }
  return false;
}
