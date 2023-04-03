import {
  EntityTransactItem,
  TransactionCancelled,
  UnexpectedVersion,
} from "@eventual/core";
import { EntityHook, EntityMethods } from "@eventual/core/internal";
import {
  EntityStore,
  isTransactionCancelledResult,
  isTransactionConflictResult,
  isUnexpectedVersionResult,
} from "../stores/entity-store.js";

export class EntityClient implements EntityHook {
  constructor(private entityStore: EntityStore) {}
  public async getEntity<Entity>(
    name: string
  ): Promise<EntityMethods<Entity> | undefined> {
    return {
      get: async (key) => {
        const entry = await this.entityStore.getEntityValue<Entity>(name, key);
        return entry?.entity;
      },
      getWithMetadata: (key) =>
        this.entityStore.getEntityValue<Entity>(name, key),
      set: async (key, entity, options) => {
        const result = await this.entityStore.setEntityValue(
          name,
          key,
          entity,
          options
        );
        if (isUnexpectedVersionResult(result)) {
          throw new UnexpectedVersion("Unexpected Version");
        }
        return result;
      },
      delete: async (key, options) => {
        const result = await this.entityStore.deleteEntityValue(
          name,
          key,
          options
        );
        if (isUnexpectedVersionResult(result)) {
          throw new UnexpectedVersion("Unexpected Version");
        }
        return result;
      },
      list: (request) => this.entityStore.listEntityEntries(name, request),
      listKeys: (request) => this.entityStore.listEntityKeys(name, request),
    };
  }

  public async transactWrite(items: EntityTransactItem<any>[]): Promise<void> {
    const normalizedItems: EntityTransactItem<any, string>[] = items.map(
      (i) => ({
        ...i,
        entity: typeof i.entity === "string" ? i.entity : i.entity.name,
      })
    );
    const result = await this.entityStore.transactWrite(normalizedItems);
    if (isTransactionCancelledResult(result)) {
      throw new TransactionCancelled(
        result.reasons.map((r) =>
          isUnexpectedVersionResult(r)
            ? new UnexpectedVersion("Unexpected Version")
            : undefined
        )
      );
    } else if (isTransactionConflictResult(result)) {
      throw new TransactionCancelled([]);
    }
    return result;
  }
}
