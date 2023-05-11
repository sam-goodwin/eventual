import {
  Entity,
  EntityAttributes,
  EntityConsistencyOptions,
  EntityKeyValue,
  EntityQueryOptions,
  EntityQueryResult,
  EntitySetOptions,
  EntityWithMetadata,
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
} from "../../stores/entity-store.js";
import { deserializeCompositeKey, serializeCompositeKey } from "../../utils.js";
import { LocalEnvConnector } from "../local-container.js";
import { paginateItems } from "./pagination.js";

export interface LocalEntityStoreProps {
  localConnector: LocalEnvConnector;
  entityProvider: EntityProvider;
}

export class LocalEntityStore extends EntityStore {
  private entities: Record<
    string,
    Map<EntityKeyValue, Map<EntityKeyValue, EntityWithMetadata>>
  > = {};

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
    value: EntityAttributes,
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

    this.getPartitionMap(entity, key.partition).set(
      key.sort?.keyValue ?? "default",
      {
        value,
        version: newVersion,
      }
    );
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

      if (!isCompleteKey(key)) {
        throw new Error("Entity key cannot be partial for delete");
      }

      this.getPartitionMap(entity, key.partition).delete(
        key.sort?.keyValue ?? "default"
      );
      this.props.localConnector.pushWorkflowTask({
        entityName: entity.name,
        key: convertNormalizedEntityKeyToMap(key),
        operation: "remove" as const,
        oldValue: item.value,
        oldVersion: item.version,
      });
    }
  }

  protected override async _query(
    entity: Entity,
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

  private getPartitionMap(
    entity: Entity,
    partitionKey: NormalizedEntityKeyCompletePart
  ) {
    const _entity = (this.entities[entity.name] ??= new Map<
      EntityKeyValue,
      Map<EntityKeyValue, EntityWithMetadata>
    >());
    let partitionMap = _entity.get(partitionKey.keyValue);
    if (!partitionMap) {
      partitionMap = new Map<EntityKeyValue, EntityWithMetadata>();
      _entity.set(partitionKey.keyValue, partitionMap);
    }
    return partitionMap;
  }
}
