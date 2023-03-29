import { Dictionary, UnexpectedVersion } from "@eventual/core";
import { DictionaryHook } from "@eventual/core/internal";
import {
  DictionaryStore,
  isUnexpectedVersionResult,
} from "../stores/dictionary-store.js";

export class DictionaryClient implements DictionaryHook {
  constructor(private dictionaryStore: DictionaryStore) {}
  public async getDictionary<Entity>(
    name: string
  ): Promise<Dictionary<Entity> | undefined> {
    return {
      name,
      schema: undefined,
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
}
