import {
  AnyEntityKey,
  EntityConsistencyOptions,
  EntityKeyType,
  EntityQueryRequest,
  EntityQueryResult,
  EntityQueryResultEntry,
  EntitySetOptions,
  EntityTransactItem,
  TransactionCancelled,
  UnexpectedVersion,
} from "@eventual/core";
import { assertNever } from "@eventual/core/internal";
import { EntityProvider } from "../../providers/entity-provider.js";
import {
  convertNormalizedEntityKeyToMap,
  EntityStore,
  EntityWithMetadata,
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

  async get(entityName: string, key: AnyEntityKey): Promise<any> {
    return this.getWithMetadata(entityName, key);
  }

  async getWithMetadata(
    entityName: string,
    key: AnyEntityKey
  ): Promise<{ entity: any; version: number } | undefined> {
    const entity = this.getEntity(entityName);
    const { partition, sort } = normalizeCompositeKey(entity, key);
    return this.getPartitionMap(name, partition.value).get(
      sort?.value ?? "default"
    );
  }

  async set(
    entityName: string,
    value: any,
    options?: EntitySetOptions | undefined
  ): Promise<{ version: number }> {
    const entity = this.getEntity(entityName);
    const normalizedKey = normalizeCompositeKey(entity, value);
    const { version = 0, entity: oldValue } =
      (await this.get(name, value)) ?? {};
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
    this.getPartitionMap(name, normalizedKey.partition.value).set(
      normalizedKey.sort?.value ?? "default",
      {
        entity,
        version: newVersion,
      }
    );
    this.props.localConnector.pushWorkflowTask({
      entityName: name,
      key: convertNormalizedEntityKeyToMap(normalizedKey),
      operation: version === 0 ? ("insert" as const) : ("modify" as const),
      newValue: value,
      newVersion,
      oldValue,
      oldVersion: version,
    });
    return { version: newVersion };
  }

  async delete(
    entityName: string,
    key: AnyEntityKey,
    options?: EntityConsistencyOptions | undefined
  ): Promise<void> {
    const entity = this.getEntity(entityName);
    const normalizedKey = normalizeCompositeKey(entity, key);
    const item = await this.get(name, key);
    if (item) {
      if (options?.expectedVersion !== undefined) {
        if (options.expectedVersion !== item.version) {
          throw new UnexpectedVersion("Unexpected Version");
        }
      }
      this.getPartitionMap(name, normalizedKey.partition.value).delete(
        normalizedKey.sort?.value ?? "default"
      );
      this.props.localConnector.pushWorkflowTask({
        entityName: name,
        key: convertNormalizedEntityKeyToMap(normalizedKey),
        operation: "remove" as const,
        oldValue: item.entity,
        oldVersion: item.version,
      });
    }
  }

  async query(
    entityName: string,
    request: EntityQueryRequest<any, string>
  ): Promise<EntityQueryResult<any>> {
    const { items, nextToken } = this.orderedEntries(entityName, request);

    // values should be sorted
    return {
      entries: items?.map(
        ([, value]) =>
          ({
            entity: value.entity,
            version: value.version,
          } satisfies EntityQueryResultEntry<any>)
      ),
      nextToken,
    };
  }

  async transactWrite(
    items: EntityTransactItem<any, any, any>[]
  ): Promise<void> {
    const keysAndVersions = Object.fromEntries(
      items.map(
        (i) =>
          [
            serializeCompositeKey(
              typeof i.entity === "string" ? i.entity : i.entity.name,
              i.operation.operation === "set"
                ? i.operation.value
                : i.operation.key
            ),
            i.operation.operation === "condition"
              ? i.operation.version
              : i.operation.options?.expectedVersion,
          ] as const
      )
    );
    /**
     * Evaluate the expected versions against the current state and return the results.
     *
     * This is similar to calling TransactWriteItem in dynamo with only ConditionChecks and then
     * handling the errors.
     */
    const consistencyResults = await Promise.allSettled(
      Object.entries(keysAndVersions).map(async ([sKey, expectedVersion]) => {
        if (expectedVersion === undefined) {
          return true;
        }
        const [name, key] = deserializeCompositeKey(sKey);
        const { version } = (await this.get(name, key)) ?? {
          version: 0,
        };
        return version === expectedVersion;
      })
    );
    if (consistencyResults.some((r) => r.status === "rejected")) {
      throw new TransactionCancelled(
        consistencyResults.map((r) =>
          r.status === "fulfilled"
            ? undefined
            : new UnexpectedVersion("Unexpected Version")
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
    name: string,
    listRequest: EntityQueryRequest<any, any>
  ) {
    const partition = this.getPartitionMap(name, listRequest.partition);
    const entries = partition ? [...partition.entries()] : [];

    const result = paginateItems(
      entries,
      (a, b) =>
        typeof a[0] === "string"
          ? a[0].localeCompare(b[0] as string)
          : typeof a[0] === "number"
          ? a[0] - (b[0] as number)
          : 0,
      listRequest.prefix
        ? ([key]) =>
            typeof key === "string" && key.startsWith(listRequest.prefix!)
        : undefined,
      undefined,
      listRequest.limit,
      listRequest.nextToken
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
