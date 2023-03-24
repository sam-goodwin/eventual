import {
  DictionaryListKeysResult,
  DictionaryListRequest,
  DictionaryListResult,
} from "@eventual/core";
import { DictionaryStore } from "../../stores/dictionary-store.js";
import { paginateItems } from "./pagination.js";

export class LocalDictionaryStore implements DictionaryStore {
  private dictionaries: Record<string, Map<string, any>> = {};

  public async getDictionaryValue<Entity>(
    name: string,
    key: string
  ): Promise<Entity | undefined> {
    return this.dictionaries[name]?.get(key);
  }

  public async setDictionaryValue<Entity>(
    name: string,
    key: string,
    entity: Entity
  ): Promise<void> {
    (this.dictionaries[name] ??= new Map()).set(key, entity);
  }

  public async deleteDictionaryValue(name: string, key: string): Promise<void> {
    this.dictionaries[name]?.delete(key);
  }

  public async listDictionaryEntries<Entity>(
    name: string,
    request: DictionaryListRequest
  ): Promise<DictionaryListResult<Entity>> {
    const { items, nextToken } = this.orderedEntries(name, request);

    // values should be sorted
    return {
      entries: items?.map(([key, value]) => ({ key, entity: value })),
      nextToken,
    };
  }

  public async listDictionaryKeys(
    name: string,
    request: DictionaryListRequest
  ): Promise<DictionaryListKeysResult> {
    const { items, nextToken } = this.orderedEntries(name, request);
    return {
      keys: items?.map(([key]) => key),
      nextToken,
    };
  }

  private orderedEntries(name: string, listRequest: DictionaryListRequest) {
    const dictionary = this.dictionaries[name];
    const entries = dictionary ? [...dictionary.entries()] : [];

    const result = paginateItems(
      entries,
      (a, b) => a[0].localeCompare(b[0]),
      listRequest.prefix
        ? ([key]) => key.startsWith(listRequest.prefix!)
        : undefined,
      undefined,
      listRequest.limit,
      listRequest.nextToken
    );

    return result;
  }
}
