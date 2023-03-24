import type {
  DictionaryListKeysResult,
  DictionaryListRequest,
  DictionaryListResult,
} from "@eventual/core";

export interface DictionaryStore {
  getDictionaryValue<Entity>(
    name: string,
    key: string
  ): Promise<Entity | undefined>;
  setDictionaryValue<Entity>(
    name: string,
    key: string,
    entity: Entity
  ): Promise<void>;
  deleteDictionaryValue(name: string, key: string): Promise<void>;
  listDictionaryEntries<Entity>(
    name: string,
    request: DictionaryListRequest
  ): Promise<DictionaryListResult<Entity>>;
  listDictionaryKeys(
    name: string,
    request: DictionaryListRequest
  ): Promise<DictionaryListKeysResult>;
}
