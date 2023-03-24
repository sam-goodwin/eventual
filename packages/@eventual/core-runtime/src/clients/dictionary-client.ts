import { Dictionary } from "@eventual/core";
import { DictionaryHook } from "@eventual/core/internal";
import { DictionaryStore } from "../stores/dictionary-store.js";

export class DictionaryClient implements DictionaryHook {
  constructor(private dictionaryStore: DictionaryStore) {}
  public async getDictionary<Entity>(
    name: string
  ): Promise<Omit<Dictionary<Entity>, "schema" | "name"> | undefined> {
    return {
      get: (key) => this.dictionaryStore.getDictionaryValue(name, key),
      set: (key, entity) =>
        this.dictionaryStore.setDictionaryValue(name, key, entity),
      delete: (key) => this.dictionaryStore.deleteDictionaryValue(name, key),
      list: (request) =>
        this.dictionaryStore.listDictionaryEntries(name, request),
      listKeys: (request) =>
        this.dictionaryStore.listDictionaryKeys(name, request),
    };
  }
}
