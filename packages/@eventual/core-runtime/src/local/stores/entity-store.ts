import {
  AnyEntityKey,
  EntityConsistencyOptions,
  EntityKeyType,
  EntityQueryKey,
  EntityQueryOptions,
  EntityQueryResult,
  EntityQueryResultEntry,
  EntitySetOptions,
  EntityTransactItem,
  EntityWithMetadata,
  TransactionCancelled,
  UnexpectedVersion,
} from "@eventual/core";
import { assertNever } from "@eventual/core/internal";
import { EntityProvider } from "../../providers/entity-provider.js";
import {
  convertNormalizedEntityKeyToMap,
  EntityStore,
  isCompleteKey,
  isCompleteKeyPart,
  normalizeCompositeKey,
} from "../../stores/entity-store.js";
import { deserializeCompositeKey, serializeCompositeKey } from "../../utils.js";
import { LocalEnvConnector } from "../local-container.js";
import { paginateItems } from "./pagination.js";

export interface LocalEntityStoreProps {
  localConnector: LocalEnvConnector;
  entityProvider: EntityProvider;
}

export class LocalEntityStore implements EntityStore {
  private entities: Record<
    string,
    Map<EntityKeyType, Map<EntityKeyType, EntityWithMetadata<any>>>
  > = {};

  constructor(private props: LocalEntityStoreProps) {}

  public async get(entityName: string, key: AnyEntityKey): Promise<any> {
    return (await this.getWithMetadata(entityName, key))?.value;
  }

  public async getWithMetadata(
    entityName: string,
    key: AnyEntityKey
  ): Promise<EntityWithMetadata<any> | undefined> {
    const entity = this.getEntity(entityName);
    const normalizedKey = normalizeCompositeKey(entity, key);
    if (!isCompleteKey(normalizedKey)) {
      throw new Error(
        "Entity key cannot be partial for get or getWithMetadata"
      );
    }

    return this.getPartitionMap(
      entityName,
      normalizedKey.partition.keyValue
    ).get(normalizedKey.sort?.keyValue ?? "default");
  }

  public async set(
    entityName: string,
    value: any,
    options?: EntitySetOptions | undefined
  ): Promise<{ version: number }> {
    const entity = this.getEntity(entityName);
    const normalizedKey = normalizeCompositeKey(entity, value);
    const { version = 0, value: oldValue } =
      (await this.getWithMetadata(entityName, value)) ?? {};
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

    if (normalizedKey.partition.partialValue) {
      throw new Error("Entity partition key cannot be partial for set");
    }

    if (normalizedKey.sort && normalizedKey.sort.partialValue) {
      throw new Error("Entity sort key cannot be partial for query");
    }

    this.getPartitionMap(entityName, normalizedKey.partition.keyValue).set(
      normalizedKey.sort?.keyValue ?? "default",
      {
        value,
        version: newVersion,
      }
    );
    this.props.localConnector.pushWorkflowTask({
      entityName,
      key: convertNormalizedEntityKeyToMap(normalizedKey),
      operation: version === 0 ? ("insert" as const) : ("modify" as const),
      newValue: value,
      newVersion,
      oldValue,
      oldVersion: version,
    });
    return { version: newVersion };
  }

  public async delete(
    entityName: string,
    key: AnyEntityKey,
    options?: EntityConsistencyOptions | undefined
  ): Promise<void> {
    const entity = this.getEntity(entityName);
    const normalizedKey = normalizeCompositeKey(entity, key);
    const item = await this.getWithMetadata(entityName, key);
    if (item) {
      if (options?.expectedVersion !== undefined) {
        if (options.expectedVersion !== item.version) {
          throw new UnexpectedVersion("Unexpected Version");
        }
      }

      if (!isCompleteKey(normalizedKey)) {
        throw new Error("Entity key cannot be partial for delete");
      }

      this.getPartitionMap(entityName, normalizedKey.partition.keyValue).delete(
        normalizedKey.sort?.keyValue ?? "default"
      );
      this.props.localConnector.pushWorkflowTask({
        entityName,
        key: convertNormalizedEntityKeyToMap(normalizedKey),
        operation: "remove" as const,
        oldValue: item.value,
        oldVersion: item.version,
      });
    }
  }

  public async query(
    entityName: string,
    queryKey: EntityQueryKey<any, any, any>,
    request?: EntityQueryOptions
  ): Promise<EntityQueryResult<any>> {
    const { items, nextToken } = this.orderedEntries(
      entityName,
      queryKey,
      request
    );

    // values should be sorted
    return {
      entries: items?.map(
        ([, value]) =>
          ({
            entity: value.value,
            version: value.version,
          } satisfies EntityQueryResultEntry<any>)
      ),
      nextToken,
    };
  }

  public async transactWrite(items: EntityTransactItem[]): Promise<void> {
    const keysAndVersions = Object.fromEntries(
      items.map((i) => {
        const entity =
          typeof i.entity === "string" ? this.getEntity(i.entity) : i.entity;
        const normalizedKey = normalizeCompositeKey(
          entity,
          i.operation.operation === "set" ? i.operation.value : i.operation.key
        );
        return [
          serializeCompositeKey(entity.name, normalizedKey),
          i.operation.operation === "condition"
            ? i.operation.version
            : i.operation.options?.expectedVersion,
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
      items.map(async (i) => {
        const entityName =
          typeof i.entity === "string" ? i.entity : i.entity.name;
        if (i.operation.operation === "set") {
          return await this.set(
            entityName,
            i.operation.value,
            i.operation.options
          );
        } else if (i.operation.operation === "delete") {
          return await this.delete(
            entityName,
            i.operation.key,
            i.operation.options
          );
        } else if (i.operation.operation === "condition") {
          // no op
          return;
        }
        return assertNever(i.operation);
      })
    );
  }

  private getEntity(entityName: string) {
    const entity = this.props.entityProvider.getEntity(entityName);
    if (!entity) {
      throw new Error(`Entity ${entityName} was not found.`);
    }
    return entity;
  }

  private orderedEntries(
    entityName: string,
    queryKey: EntityQueryKey<any, any, any>,
    queryOptions?: EntityQueryOptions
  ) {
    const entity = this.getEntity(entityName);
    const normalizedKey = normalizeCompositeKey(entity, queryKey);

    if (!isCompleteKeyPart(normalizedKey.partition)) {
      throw new Error("Entity partition key cannot be partial for query");
    }

    const partition = this.getPartitionMap(
      entityName,
      normalizedKey.partition.keyValue
    );
    const entries = partition ? [...partition.entries()] : [];

    const result = paginateItems(
      entries,
      (a, b) =>
        typeof a[0] === "string"
          ? a[0].localeCompare(b[0] as string)
          : typeof a[0] === "number"
          ? a[0] - (b[0] as number)
          : 0,
      undefined,
      undefined,
      queryOptions?.limit,
      queryOptions?.nextToken
    );

    return result;
  }

  private getPartitionMap(entityName: string, partition: EntityKeyType) {
    const entity = (this.entities[entityName] ??= new Map<
      EntityKeyType,
      Map<EntityKeyType, EntityWithMetadata<any>>
    >());
    let partitionMap = entity.get(partition);
    if (!partitionMap) {
      partitionMap = new Map<EntityKeyType, EntityWithMetadata<any>>();
      entity.set(partition, partitionMap);
    }
    return partitionMap;
  }
}
