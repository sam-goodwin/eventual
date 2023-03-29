import {
  CompositeKey,
  DictionaryConsistencyOptions,
  DictionaryListKeysResult,
  DictionaryListRequest,
  DictionaryListResult,
  DictionarySetOptions,
} from "@eventual/core";
import {
  DictionaryStore,
  EntityWithMetadata,
  UnexpectedVersionResult,
  normalizeCompositeKey,
} from "../../stores/dictionary-store.js";
import { LocalEnvConnector } from "../local-container.js";
import { paginateItems } from "./pagination.js";

export interface LocalDictionaryStoreProps {
  localConnector: LocalEnvConnector;
}

export class LocalDictionaryStore implements DictionaryStore {
  private dictionaries: Record<
    string,
    Record<string, Map<string, EntityWithMetadata<any>>>
  > = {};

  constructor(private props: LocalDictionaryStoreProps) {}

  public async getDictionaryValue<Entity>(
    name: string,
    _key: string | CompositeKey
  ): Promise<EntityWithMetadata<Entity> | undefined> {
    const { key, namespace } = normalizeCompositeKey(_key);
    return this.getNamespaceMap(name, namespace).get(key);
  }

  public async setDictionaryValue<Entity>(
    name: string,
    _key: string | CompositeKey,
    entity: Entity,
    options?: DictionarySetOptions
  ): Promise<{ version: number }> {
    const { key, namespace } = normalizeCompositeKey(_key);
    const { version = 0, entity: oldValue } =
      (await this.getDictionaryValue(name, _key)) ?? {};
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
    this.getNamespaceMap(name, namespace).set(key, {
      entity,
      version: newVersion,
    });

    this.props.localConnector.pushWorkflowTask({
      dictionaryName: name,
      key,
      namespace,
      operation: version === 0 ? ("insert" as const) : ("modify" as const),
      newValue: entity,
      newVersion,
      oldValue,
      oldVersion: version,
    });

    return { version: newVersion };
  }

  public async deleteDictionaryValue(
    name: string,
    _key: string,
    options?: DictionaryConsistencyOptions
  ): Promise<void | UnexpectedVersionResult> {
    const { key, namespace } = normalizeCompositeKey(_key);
    const item = await this.getDictionaryValue(name, _key);

    if (item) {
      if (options?.expectedVersion !== undefined) {
        if (options.expectedVersion !== item.version) {
          return { unexpectedVersion: true };
        }
      }
      this.getNamespaceMap(name, namespace).delete(key);

      this.props.localConnector.pushWorkflowTask({
        dictionaryName: name,
        key,
        namespace,
        operation: "remove" as const,
        oldValue: item.entity,
        oldVersion: item.version,
      });
    }
  }

  public async listDictionaryEntries<Entity>(
    name: string,
    request: DictionaryListRequest
  ): Promise<DictionaryListResult<Entity>> {
    const { items, nextToken } = this.orderedEntries(name, request);

    // values should be sorted
    return {
      entries: items?.map(([key, value]) => ({
        key,
        entity: value.entity,
        version: value.version,
      })),
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
    const namespace = this.getNamespaceMap(name, listRequest.namespace);
    const entries = namespace ? [...namespace.entries()] : [];

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

  private getNamespaceMap(name: string, namespace?: string) {
    const dictionary = (this.dictionaries[name] ??= {});
    const namespaceMap = (dictionary[namespace ?? "default"] ??= new Map<
      string,
      EntityWithMetadata<any>
    >());
    return namespaceMap;
  }
}
