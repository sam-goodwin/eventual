import {
  DictionaryListRequest,
  DictionaryListResult,
  DictionaryListKeysResult,
} from "@eventual/core";
import { DictionaryStore } from "../../stores/dictionary-store.js";

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
    const { items, cursor } = this.orderedEntries(name, request);

    // values should be sorted
    return {
      entries: items?.map(([key, value]) => ({ key, entity: value })),
      cursor,
    };
  }

  public async listDictionaryKeys(
    name: string,
    request: DictionaryListRequest
  ): Promise<DictionaryListKeysResult> {
    const { items, cursor } = this.orderedEntries(name, request);
    return {
      keys: items?.map(([key]) => key),
      cursor,
    };
  }

  private orderedEntries(name: string, listRequest: DictionaryListRequest) {
    const dictionary = this.dictionaries[name];
    if (!dictionary) {
      return {};
    }
    const cursor = listRequest.cursor
      ? deserializeCursor(listRequest.cursor)
      : undefined;
    const entries = [...dictionary.entries()];
    const filteredAndSorted = (
      listRequest.prefix
        ? entries.filter(([key]) => key.startsWith(listRequest.prefix!))
        : entries
    ).sort((a, b) => a[0].localeCompare(b[0]));
    const start = cursor ? cursor.nextIndex : 0;
    const end = listRequest.limit ? start + listRequest.limit : undefined;
    const limited = filteredAndSorted.slice(start, end);
    return {
      items: limited,
      cursor:
        end && end < filteredAndSorted.length
          ? serializeCursor({ nextIndex: end })
          : undefined,
    };
  }
}

interface Cursor {
  nextIndex: number;
}

function serializeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64");
}

function deserializeCursor(cursor: string): Cursor {
  return JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
}
