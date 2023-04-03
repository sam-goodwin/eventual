import { z } from "zod";
import {
  createEventualCall,
  EventualCallKind,
} from "./internal/calls/calls.js";
import {
  DictionaryCall,
  DictionaryDeleteOperation,
  DictionarySetOperation,
} from "./internal/calls/dictionary-call.js";
import { getDictionaryHook } from "./internal/dictionary-hook.js";
import { dictionaries } from "./internal/global.js";
import {
  DictionarySpec,
  DictionaryStreamOptions,
  DictionaryStreamSpec,
  isSourceLocation,
  SourceLocation,
} from "./internal/service-spec.js";

export interface CompositeKey {
  namespace: string;
  key: string;
}

export interface DictionaryListResult<Entity> {
  entries?: { key: string; entity: Entity; version: number }[];
  /**
   * Returned when there are more values than the limit allowed to return.
   */
  nextToken?: string;
}

export interface DictionaryListKeysResult {
  /**
   * Keys that match the provided prefix. If using composite keys, this will only be the key part (not the namespace).
   */
  keys?: string[];
  /**
   * Returned when there are more values than the limit allowed to return.
   */
  nextToken?: string;
}

export interface DictionaryListRequest {
  /**
   * Namespace to retrieve values for.
   *
   * @default - retrieve values with no namespace.
   */
  namespace?: string;
  /**
   * Key prefix to retrieve values or keys for.
   * Values are only retrieved for a single name + namespace pair (including no namespace).
   */
  prefix?: string;
  /**
   * Number of items to retrieve
   * @default 100
   */
  limit?: number;
  nextToken?: string;
}

export interface DictionaryConsistencyOptions {
  /**
   * The expected version of the entity in the dictionary.
   *
   * Used to support consistent writes and deletes.
   * A value of 0 will only pass if the item is new.
   */
  expectedVersion?: number;
}

export interface DictionarySetOptions extends DictionaryConsistencyOptions {
  /**
   * Whether or not to update the version on change.
   * If this is the first time the value has been set, it will be set to 1.
   *
   * @default true - version will be incremented.
   */
  incrementVersion?: boolean;
}

export interface DictionaryStreamHandler<Entity> {
  /**
   * Provides the keys, new value\
   */
  (item: DictionaryStreamItem<Entity>): Promise<void | false> | void | false;
}

export interface DictionaryStreamItemBase {
  streamName: string;
  dictionaryName: string;
  namespace?: string;
  key: string;
}

export type DictionaryStreamItem<Entity> =
  | DictionaryStreamInsertItem<Entity>
  | DictionaryStreamModifyItem<Entity>
  | DictionaryStreamRemoveItem<Entity>;

export interface DictionaryStreamInsertItem<Entity>
  extends DictionaryStreamItemBase {
  newValue: Entity;
  newVersion: number;
  operation: "insert";
}

export interface DictionaryStreamModifyItem<Entity>
  extends DictionaryStreamItemBase {
  operation: "modify";
  newValue: Entity;
  newVersion: number;
  oldValue?: Entity;
  oldVersion?: number;
}

export interface DictionaryStreamRemoveItem<Entity>
  extends DictionaryStreamItemBase {
  operation: "remove";
  oldValue?: Entity;
  oldVersion?: number;
}

export function isDictionaryStreamItem(
  value: any
): value is DictionaryStreamItem<any> {
  return "dictionaryName" in value && "operation" in value;
}

export function dictionaryStreamMatchesItem(
  item: DictionaryStreamItem<any>,
  streamSpec: DictionaryStreamSpec
) {
  return (
    streamSpec.dictionaryName === item.dictionaryName &&
    (!streamSpec.options?.operations ||
      streamSpec.options.operations.includes(item.operation)) &&
    (!streamSpec.options?.namespaces ||
      (item.namespace &&
        streamSpec.options.namespaces.includes(item.namespace))) &&
    (!streamSpec.options?.namespacePrefixes ||
      (item.namespace &&
        streamSpec.options.namespacePrefixes.some((p) =>
          item.namespace?.startsWith(p)
        )))
  );
}

export interface DictionaryStream<Entity> extends DictionaryStreamSpec {
  kind: "DictionaryStream";
  handler: DictionaryStreamHandler<Entity>;
  sourceLocation?: SourceLocation;
}

export interface Dictionary<Entity>
  extends Omit<DictionarySpec, "schema" | "streams"> {
  kind: "Dictionary";
  name: string;
  schema?: z.Schema<Entity>;
  streams: DictionaryStream<Entity>[];
  /**
   * Get a value.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  get(key: string | CompositeKey): Promise<Entity | undefined>;
  /**
   * Get a value and metadata like version.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  getWithMetadata(
    key: string | CompositeKey
  ): Promise<{ entity: Entity; version: number } | undefined>;
  /**
   * Sets or updates a value within a dictionary and optionally a namespace.
   *
   * Values with namespaces are considered distinct from value without a namespace or within different namespaces.
   * Values and keys can only be listed within a single namespace.
   */
  set(
    key: string | CompositeKey,
    entity: Entity,
    options?: DictionarySetOptions
  ): Promise<{ version: number }>;
  /**
   * Deletes a single entry within a dictionary and namespace.
   */
  delete(
    key: string | CompositeKey,
    options?: DictionaryConsistencyOptions
  ): Promise<void>;
  /**
   * List entries that match a prefix within a dictionary and namespace.
   *
   * If namespace is not provided, only values which do not use composite keys will be returned.
   */
  list(request: DictionaryListRequest): Promise<DictionaryListResult<Entity>>;
  /**
   * List keys that match a prefix within a dictionary and namespace.
   *
   * If namespace is not provided, only values which do not use composite keys will be returned.
   */
  listKeys(request: DictionaryListRequest): Promise<DictionaryListKeysResult>;
  stream(
    name: string,
    options: DictionaryStreamOptions,
    handler: DictionaryStreamHandler<Entity>
  ): DictionaryStream<Entity>;
  stream(
    name: string,
    handler: DictionaryStreamHandler<Entity>
  ): DictionaryStream<Entity>;
}

export interface DictionaryTransactItem<
  Entity = any,
  D extends string | Dictionary<Entity> = string | Dictionary<Entity>
> {
  dictionary: D;
  operation:
    | Omit<DictionarySetOperation<Entity>, "name">
    | Omit<DictionaryDeleteOperation, "name">
    | Omit<DictionaryConditionalOperation, "name">;
}

/**
 * Used in transactions, cancels the transaction if the key's version does not match.
 */
export interface DictionaryConditionalOperation {
  operation: "condition";
  key: string | CompositeKey;
  version?: number;
}

export const Dictionary = {
  transactWrite: <Items extends DictionaryTransactItem<any>[]>(
    items: Items
  ): Promise<void> => {
    return getEventualCallHook().registerEventualCall(
      createEventualCall<DictionaryCall<"transact">>(
        EventualCallKind.DictionaryCall,
        {
          operation: "transact",
          items,
        }
      ),
      async () => {
        return getDictionaryHook().transactWrite(items);
      }
    );
  },
};

export function dictionary<Entity>(
  name: string,
  schema?: z.Schema<Entity>
): Dictionary<Entity> {
  if (dictionaries().has(name)) {
    throw new Error(`dictionary with name '${name}' already exists`);
  }

  /**
   * Used to maintain a limited number of streams on the dictionary.
   */
  const streams: DictionaryStream<Entity>[] = [];

  const dictionary: Dictionary<Entity> = {
    kind: "Dictionary",
    name,
    schema,
    streams,
    get: (key: string | CompositeKey) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<DictionaryCall<"get">>(
          EventualCallKind.DictionaryCall,
          {
            name,
            operation: "get",
            key,
          }
        ),
        async () => {
          return (await getDictionary()).get(key);
        }
      );
    },
    getWithMetadata: async (key: string | CompositeKey) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<DictionaryCall<"getWithMetadata">>(
          EventualCallKind.DictionaryCall,
          {
            name,
            operation: "getWithMetadata",
            key,
          }
        ),
        async () => {
          return (await getDictionary()).getWithMetadata(key);
        }
      );
    },
    set: async (
      key: string | CompositeKey,
      entity: Entity,
      options?: DictionarySetOptions
    ) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<DictionaryCall<"set">>(
          EventualCallKind.DictionaryCall,
          {
            name,
            operation: "set",
            key,
            options,
            value: entity,
          }
        ),
        async () => {
          return (await getDictionary()).set(key, entity, options);
        }
      );
    },
    delete: async (key, options) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<DictionaryCall<"delete">>(
          EventualCallKind.DictionaryCall,
          {
            name,
            operation: "delete",
            key,
            options,
          }
        ),
        async () => {
          return (await getDictionary()).delete(key, options);
        }
      );
    },
    list: async (request) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<DictionaryCall<"list">>(
          EventualCallKind.DictionaryCall,
          {
            name,
            operation: "list",
            request,
          }
        ),
        async () => {
          return (await getDictionary()).list(request);
        }
      );
    },
    listKeys: async (request) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<DictionaryCall<"listKeys">>(
          EventualCallKind.DictionaryCall,
          {
            name,
            operation: "listKeys",
            request,
          }
        ),
        async () => {
          return (await getDictionary()).listKeys(request);
        }
      );
    },
    stream: (
      ...args:
        | [name: string, handler: DictionaryStreamHandler<Entity>]
        | [
            name: string,
            options: DictionaryStreamOptions,
            handler: DictionaryStreamHandler<Entity>
          ]
        | [
            sourceLocation: SourceLocation,
            name: string,
            handler: DictionaryStreamHandler<Entity>
          ]
        | [
            sourceLocation: SourceLocation,
            name: string,
            options: DictionaryStreamOptions,
            handler: DictionaryStreamHandler<Entity>
          ]
    ) => {
      const [sourceLocation, streamName, options, handler] =
        args.length === 2
          ? [, args[0], , args[1]]
          : args.length === 4
          ? args
          : isSourceLocation(args[0]) && typeof args[1] === "string"
          ? [args[0], args[1] as string, , args[2]]
          : [, args[0] as string, args[1] as DictionaryStreamOptions, args[2]];

      if (streams.length > 1) {
        throw new Error("Only two streams are allowed per dictionary.");
      }

      const dictionaryStream: DictionaryStream<Entity> = {
        kind: "DictionaryStream",
        handler,
        name: streamName,
        dictionaryName: name,
        options,
        sourceLocation,
      };

      streams.push(dictionaryStream);

      return dictionaryStream;
    },
  };

  dictionaries().set(name, dictionary);

  return dictionary;

  async function getDictionary() {
    const dictionaryHook = getDictionaryHook();
    const dictionary = await dictionaryHook.getDictionary<Entity>(name);
    if (!dictionary) {
      throw new Error(`Dictionary ${name} does not exist.`);
    }
    return dictionary;
  }
}

export function dictionaryStream<Entity>(
  ...args:
    | [
        name: string,
        dictionary: Dictionary<Entity>,
        handler: DictionaryStreamHandler<Entity>
      ]
    | [
        name: string,
        dictionary: Dictionary<Entity>,
        options: DictionaryStreamOptions,
        handler: DictionaryStreamHandler<Entity>
      ]
    | [
        sourceLocation: SourceLocation,
        name: string,
        dictionary: Dictionary<Entity>,
        handler: DictionaryStreamHandler<Entity>
      ]
    | [
        sourceLocation: SourceLocation,
        name: string,
        dictionary: Dictionary<Entity>,
        options: DictionaryStreamOptions,
        handler: DictionaryStreamHandler<Entity>
      ]
) {
  const [sourceLocation, name, dictionary, options, handler] =
    args.length === 3
      ? [, args[0], args[1], , args[2]]
      : args.length === 5
      ? args
      : isSourceLocation(args[0])
      ? [args[0], args[1] as string, args[2] as Dictionary<Entity>, , args[3]]
      : [
          ,
          args[0] as string,
          args[1] as Dictionary<Entity>,
          args[2] as DictionaryStreamOptions,
          args[3],
        ];

  return sourceLocation
    ? options
      ? // @ts-ignore
        dictionary.stream(sourceLocation, name, options, handler)
      : // @ts-ignore
        dictionary.stream(sourceLocation, name, handler)
    : options
    ? dictionary.stream(name, options, handler)
    : dictionary.stream(name, handler);
}
