import type { z } from "zod";
import {
  createEventualCall,
  EntityCall,
  EntityDeleteOperation,
  EntitySetOperation,
  EventualCallKind,
} from "./internal/calls.js";
import { getEntityHook } from "./internal/entity-hook.js";
import { entities } from "./internal/global.js";
import {
  EntitySpec,
  EntityStreamOptions,
  EntityStreamSpec,
  isSourceLocation,
  SourceLocation,
} from "./internal/service-spec.js";

export interface CompositeKey {
  namespace: string;
  key: string;
}

export interface EntityListResult<Entity> {
  entries?: { key: string; entity: Entity; version: number }[];
  /**
   * Returned when there are more values than the limit allowed to return.
   */
  nextToken?: string;
}

export interface EntityListKeysResult {
  /**
   * Keys that match the provided prefix. If using composite keys, this will only be the key part (not the namespace).
   */
  keys?: string[];
  /**
   * Returned when there are more values than the limit allowed to return.
   */
  nextToken?: string;
}

export interface EntityListRequest {
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

export interface EntityConsistencyOptions {
  /**
   * The expected version of the entity in the entity.
   *
   * Used to support consistent writes and deletes.
   * A value of 0 will only pass if the item is new.
   */
  expectedVersion?: number;
}

export interface EntitySetOptions extends EntityConsistencyOptions {
  /**
   * Whether or not to update the version on change.
   * If this is the first time the value has been set, it will be set to 1.
   *
   * @default true - version will be incremented.
   */
  incrementVersion?: boolean;
}

export interface EntityStreamHandler<Entity> {
  /**
   * Provides the keys, new value\
   */
  (item: EntityStreamItem<Entity>): Promise<void | false> | void | false;
}

export interface EntityStreamItemBase {
  streamName: string;
  entityName: string;
  namespace?: string;
  key: string;
}

export type EntityStreamItem<Entity> =
  | EntityStreamInsertItem<Entity>
  | EntityStreamModifyItem<Entity>
  | EntityStreamRemoveItem<Entity>;

export interface EntityStreamInsertItem<Entity> extends EntityStreamItemBase {
  newValue: Entity;
  newVersion: number;
  operation: "insert";
}

export interface EntityStreamModifyItem<Entity> extends EntityStreamItemBase {
  operation: "modify";
  newValue: Entity;
  newVersion: number;
  oldValue?: Entity;
  oldVersion?: number;
}

export interface EntityStreamRemoveItem<Entity> extends EntityStreamItemBase {
  operation: "remove";
  oldValue?: Entity;
  oldVersion?: number;
}

export function isEntityStreamItem(value: any): value is EntityStreamItem<any> {
  return "entityName" in value && "operation" in value;
}

export function entityStreamMatchesItem(
  item: EntityStreamItem<any>,
  streamSpec: EntityStreamSpec
) {
  return (
    streamSpec.entityName === item.entityName &&
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

export interface EntityStream<Entity> extends EntityStreamSpec {
  kind: "EntityStream";
  handler: EntityStreamHandler<Entity>;
  sourceLocation?: SourceLocation;
}

export interface Entity<E> extends Omit<EntitySpec, "schema" | "streams"> {
  kind: "Entity";
  name: string;
  schema?: z.Schema<E>;
  streams: EntityStream<E>[];
  /**
   * Get a value.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  get(key: string | CompositeKey): Promise<E | undefined>;
  /**
   * Get a value and metadata like version.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  getWithMetadata(
    key: string | CompositeKey
  ): Promise<{ entity: E; version: number } | undefined>;
  /**
   * Sets or updates a value within an entity and optionally a namespace.
   *
   * Values with namespaces are considered distinct from value without a namespace or within different namespaces.
   * Values and keys can only be listed within a single namespace.
   */
  set(
    key: string | CompositeKey,
    entity: E,
    options?: EntitySetOptions
  ): Promise<{ version: number }>;
  /**
   * Deletes a single entry within an entity and namespace.
   */
  delete(
    key: string | CompositeKey,
    options?: EntityConsistencyOptions
  ): Promise<void>;
  /**
   * List entries that match a prefix within an entity and namespace.
   *
   * If namespace is not provided, only values which do not use composite keys will be returned.
   */
  list(request: EntityListRequest): Promise<EntityListResult<E>>;
  /**
   * List keys that match a prefix within an entity and namespace.
   *
   * If namespace is not provided, only values which do not use composite keys will be returned.
   */
  listKeys(request: EntityListRequest): Promise<EntityListKeysResult>;
  stream(
    name: string,
    options: EntityStreamOptions,
    handler: EntityStreamHandler<E>
  ): EntityStream<E>;
  stream(name: string, handler: EntityStreamHandler<E>): EntityStream<E>;
}

export interface EntityTransactItem<
  E = any,
  D extends string | Entity<E> = string | Entity<E>
> {
  entity: D;
  operation:
    | Omit<EntitySetOperation<E>, "name">
    | Omit<EntityDeleteOperation, "name">
    | Omit<EntityConditionalOperation, "name">;
}

/**
 * Used in transactions, cancels the transaction if the key's version does not match.
 */
export interface EntityConditionalOperation {
  operation: "condition";
  name: string;
  key: string | CompositeKey;
  version?: number;
}

export const Entity = {
  transactWrite: <Items extends EntityTransactItem<any>[]>(
    items: Items
  ): Promise<void> => {
    return getEventualCallHook().registerEventualCall(
      createEventualCall<EntityCall<"transact">>(EventualCallKind.EntityCall, {
        operation: "transact",
        items,
      }),
      async () => {
        return getEntityHook().transactWrite(items);
      }
    );
  },
};

export function entity<E>(name: string, schema?: z.Schema<E>): Entity<E> {
  if (entities().has(name)) {
    throw new Error(`entity with name '${name}' already exists`);
  }

  /**
   * Used to maintain a limited number of streams on the entity.
   */
  const streams: EntityStream<E>[] = [];

  const entity: Entity<E> = {
    kind: "Entity",
    name,
    schema,
    streams,
    get: (key: string | CompositeKey) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<EntityCall<"get">>(EventualCallKind.EntityCall, {
          name,
          operation: "get",
          key,
        }),
        async () => {
          return (await getEntity()).get(key);
        }
      );
    },
    getWithMetadata: (key: string | CompositeKey) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<EntityCall<"getWithMetadata">>(
          EventualCallKind.EntityCall,
          {
            name,
            operation: "getWithMetadata",
            key,
          }
        ),
        async () => {
          return (await getEntity()).getWithMetadata(key);
        }
      );
    },
    set: (
      key: string | CompositeKey,
      entity: E,
      options?: EntitySetOptions
    ) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<EntityCall<"set">>(EventualCallKind.EntityCall, {
          name,
          operation: "set",
          key,
          options,
          value: entity,
        }),
        async () => {
          return (await getEntity()).set(key, entity, options);
        }
      );
    },
    delete: (key, options) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<EntityCall<"delete">>(EventualCallKind.EntityCall, {
          name,
          operation: "delete",
          key,
          options,
        }),
        async () => {
          return (await getEntity()).delete(key, options);
        }
      );
    },
    list: (request) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<EntityCall<"list">>(EventualCallKind.EntityCall, {
          name,
          operation: "list",
          request,
        }),
        async () => {
          return (await getEntity()).list(request);
        }
      );
    },
    listKeys: (request) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<EntityCall<"listKeys">>(
          EventualCallKind.EntityCall,
          {
            name,
            operation: "listKeys",
            request,
          }
        ),
        async () => {
          return (await getEntity()).listKeys(request);
        }
      );
    },
    stream: (
      ...args:
        | [name: string, handler: EntityStreamHandler<E>]
        | [
            name: string,
            options: EntityStreamOptions,
            handler: EntityStreamHandler<E>
          ]
        | [
            sourceLocation: SourceLocation,
            name: string,
            handler: EntityStreamHandler<E>
          ]
        | [
            sourceLocation: SourceLocation,
            name: string,
            options: EntityStreamOptions,
            handler: EntityStreamHandler<E>
          ]
    ) => {
      const [sourceLocation, streamName, options, handler] =
        args.length === 2
          ? [, args[0], , args[1]]
          : args.length === 4
          ? args
          : isSourceLocation(args[0]) && typeof args[1] === "string"
          ? [args[0], args[1] as string, , args[2]]
          : [, args[0] as string, args[1] as EntityStreamOptions, args[2]];

      if (streams.length > 1) {
        throw new Error("Only two streams are allowed per entity.");
      }

      const entityStream: EntityStream<E> = {
        kind: "EntityStream",
        handler,
        name: streamName,
        entityName: name,
        options,
        sourceLocation,
      };

      streams.push(entityStream);

      return entityStream;
    },
  };

  entities().set(name, entity);

  return entity;

  async function getEntity() {
    const entityHook = getEntityHook();
    const entity = await entityHook.getEntity<E>(name);
    if (!entity) {
      throw new Error(`Entity ${name} does not exist.`);
    }
    return entity;
  }
}

export function entityStream<E>(
  ...args:
    | [name: string, entity: Entity<E>, handler: EntityStreamHandler<E>]
    | [
        name: string,
        entity: Entity<E>,
        options: EntityStreamOptions,
        handler: EntityStreamHandler<E>
      ]
    | [
        sourceLocation: SourceLocation,
        name: string,
        entity: Entity<E>,
        handler: EntityStreamHandler<E>
      ]
    | [
        sourceLocation: SourceLocation,
        name: string,
        entity: Entity<E>,
        options: EntityStreamOptions,
        handler: EntityStreamHandler<E>
      ]
) {
  const [sourceLocation, name, entity, options, handler] =
    args.length === 3
      ? [, args[0], args[1], , args[2]]
      : args.length === 5
      ? args
      : isSourceLocation(args[0])
      ? [args[0], args[1] as string, args[2] as Entity<E>, , args[3]]
      : [
          ,
          args[0] as string,
          args[1] as Entity<E>,
          args[2] as EntityStreamOptions,
          args[3],
        ];

  return sourceLocation
    ? options
      ? // @ts-ignore
        entity.stream(sourceLocation, name, options, handler)
      : // @ts-ignore
        entity.stream(sourceLocation, name, handler)
    : options
    ? entity.stream(name, options, handler)
    : entity.stream(name, handler);
}
