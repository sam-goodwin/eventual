import {
  DictionaryTransactItem,
  TransactionCancelled,
  UnexpectedVersion,
} from "@eventual/core";
import { DictionaryHook, DictionaryMethods } from "@eventual/core/internal";
import {
  DictionaryStore,
  isTransactionCancelledResult,
  isTransactionConflictResult,
  isUnexpectedVersionResult,
} from "../stores/dictionary-store.js";

export class DictionaryClient implements DictionaryHook {
  constructor(private dictionaryStore: DictionaryStore) {}
  public async getDictionary<Entity>(
    name: string
  ): Promise<DictionaryMethods<Entity> | undefined> {
    return {
      get: async (key) => {
        const entry = await this.dictionaryStore.getDictionaryValue<Entity>(
          name,
          key
        );
        return entry?.entity;
      },
      getWithMetadata: (key) =>
        this.dictionaryStore.getDictionaryValue<Entity>(name, key),
      set: async (key, entity, options) => {
        const result = await this.dictionaryStore.setDictionaryValue(
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
        const result = await this.dictionaryStore.deleteDictionaryValue(
          name,
          key,
          options
        );
        if (isUnexpectedVersionResult(result)) {
          throw new UnexpectedVersion("Unexpected Version");
        }
        return result;
      },
      list: (request) =>
        this.dictionaryStore.listDictionaryEntries(name, request),
      listKeys: (request) =>
        this.dictionaryStore.listDictionaryKeys(name, request),
    };
  }

  public async transactWrite(
    items: DictionaryTransactItem<any>[]
  ): Promise<void> {
    const normalizedItems: DictionaryTransactItem<any, string>[] = items.map(
      (i) => ({
        ...i,
        dictionary:
          typeof i.dictionary === "string" ? i.dictionary : i.dictionary.name,
      })
    );
    const result = await this.dictionaryStore.transactWrite(normalizedItems);
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
