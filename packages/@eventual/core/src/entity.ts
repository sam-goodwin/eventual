import type { z } from "zod";
import {
  createEventualCall,
  EntityCall,
  EventualCallKind,
} from "./internal/calls.js";
import { getEntityHook } from "./internal/entity-hook.js";
import { entities } from "./internal/global.js";
import {
  EntityKeyBinary,
  EntityKeyNumber,
  EntityKeyString,
  EntitySpec,
  EntityStreamOptions,
  EntityStreamSpec,
  isSourceLocation,
  SourceLocation,
} from "./internal/service-spec.js";
import type { ServiceContext } from "./service.js";

export interface EntityQueryResultEntry<E extends EntityValue> {
  entity: E;
  version: number;
}

export interface EntityQueryResult<E extends EntityValue> {
  entries?: EntityQueryResultEntry<E>[];
  /**
   * Returned when there are more values than the limit allowed to return.
   */
  nextToken?: string;
}

export interface EntityQueryRequest<
  E extends EntityValue,
  Partition extends EntityKeyField<E>
> {
  /**
   * Partition key to retrieve values for.
   *
   * @default - retrieve values with no namespace.
   */
  partition: E[Partition];
  /**
   * Sort key prefix to retrieve values or keys for.
   * Values are only retrieved for a single name + partition pair.
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

export interface EntityStreamContext {
  /**
   * Information about the containing service.
   */
  service: ServiceContext;
}

export interface EntityStreamHandler<E extends AnyEntity> {
  /**
   * Provides the keys, new value
   */
  (item: EntityStreamItem<E>, context: EntityStreamContext):
    | Promise<void | false>
    | void
    | false;
}

export interface EntityStreamItemBase<E extends AnyEntity> {
  streamName: string;
  entityName: string;
  key: EntityCompositeKeyFromEntity<E>;
}

export type EntityStreamItem<E extends AnyEntity = AnyEntity> =
  | EntityStreamInsertItem<E>
  | EntityStreamModifyItem<E>
  | EntityStreamRemoveItem<E>;

export interface EntityStreamInsertItem<E extends AnyEntity>
  extends EntityStreamItemBase<E> {
  newValue: EntitySchema<E>;
  newVersion: number;
  operation: "insert";
}

export interface EntityStreamModifyItem<E extends AnyEntity>
  extends EntityStreamItemBase<E> {
  operation: "modify";
  newValue: EntitySchema<E>;
  newVersion: number;
  oldValue?: EntitySchema<E>;
  oldVersion?: number;
}

export interface EntityStreamRemoveItem<E extends AnyEntity>
  extends EntityStreamItemBase<E> {
  operation: "remove";
  oldValue?: EntitySchema<E>;
  oldVersion?: number;
}

export interface EntityStream<E extends AnyEntity> extends EntityStreamSpec {
  kind: "EntityStream";
  handler: EntityStreamHandler<E>;
  sourceLocation?: SourceLocation;
}

export type AnyEntity = Entity<any, string, string | undefined>;

export type EntityKeyType = string | number | EntityBinaryMember;

export type EntityBinaryMember =
  | ArrayBuffer
  | Blob
  | Buffer
  | DataView
  | File
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

export type EntityValueMember =
  | EntityValue
  | string
  | number
  | boolean
  | EntityBinaryMember
  | Set<string | number | boolean | EntityBinaryMember>
  | EntityValueMember[];

export type EntityValue = {
  [key: string]: EntityValueMember;
};

export type EntityKeyField<E extends EntityValue> = {
  [K in keyof E]: K extends string
    ? E[K] extends EntityKeyType
      ? K
      : never
    : never;
}[keyof E];

export type EntityCompositeKeyFromEntity<E extends AnyEntity> =
  E extends Entity<infer Schema, infer Partition, infer Sort>
    ? EntityCompositeKey<Schema, Partition, Sort>
    : never;

export type EntityKeyFromEntity<E extends AnyEntity> = E extends Entity<
  infer Schema,
  infer Partition,
  infer Sort
>
  ? EntityKey<Schema, Partition, Sort>
  : never;

export type EntityCompositeKey<
  E extends EntityValue,
  Partition extends EntityKeyField<E>,
  Sort extends EntityKeyField<E> | undefined
> = Sort extends undefined
  ? Pick<E, Partition>
  : Pick<E, Partition | Exclude<Sort, undefined>>;

export type EntityKeyTuple<
  E extends EntityValue,
  Partition extends EntityKeyField<E>,
  Sort extends EntityKeyField<E> | undefined
> = Sort extends undefined
  ? [p: E[Partition]]
  : [p: E[Partition], s: E[Exclude<Sort, undefined>]];

export type EntityKey<
  E extends EntityValue,
  Partition extends EntityKeyField<E>,
  Sort extends EntityKeyField<E> | undefined
> = EntityCompositeKey<E, Partition, Sort> | EntityKeyTuple<E, Partition, Sort>;

export type AnyEntityKey = EntityKey<any, string, string | undefined>;

export type EntityPartitionKey<E extends AnyEntity> = E extends Entity<
  any,
  infer Partition,
  any
>
  ? Partition
  : never;

export type EntitySortKey<E extends AnyEntity> = E extends Entity<
  any,
  any,
  infer Sort
>
  ? Sort
  : never;

export type EntitySchema<E extends AnyEntity> = E extends Entity<
  infer Schema,
  any,
  any
>
  ? Schema
  : never;

export type EntityKeyReference<
  E extends EntityValue,
  F extends EntityKeyField<E> | undefined
> = F extends undefined
  ? undefined
  : E[Exclude<F, undefined>] extends string
  ? F | EntityKeyString<Exclude<F, undefined>>
  : E[Exclude<F, undefined>] extends number
  ? EntityKeyNumber<Exclude<F, undefined>>
  : E[Exclude<F, undefined>] extends EntityBinaryMember
  ? EntityKeyBinary<Exclude<F, undefined>>
  : never;

export interface EntityWithMetadata<E extends EntityValue> {
  value: E;
  version: number;
}

export interface Entity<
  E extends EntityValue,
  P extends EntityKeyField<E>,
  S extends EntityKeyField<E> | undefined
> extends Omit<EntitySpec, "schema" | "streams" | "partitionKey" | "sortKey"> {
  __entityBrand: E;
  kind: "Entity";
  partitionKey: EntityKeyReference<E, P>;
  sortKey?: EntityKeyReference<E, S>;
  schema?: ZodMappedSchema<E>;
  streams: EntityStream<Entity<E, P, S>>[];
  /**
   * Get a value.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  get(key: EntityKey<E, P, S>): Promise<E | undefined>;
  /**
   * Get a value and metadata like version.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  getWithMetadata(
    key: EntityKey<E, P, S>
  ): Promise<EntityWithMetadata<E> | undefined>;
  /**
   * Sets or updates a value within an entity and optionally a namespace.
   *
   * Values with namespaces are considered distinct from value without a namespace or within different namespaces.
   * Values and keys can only be listed within a single namespace.
   */
  set(entity: E, options?: EntitySetOptions): Promise<{ version: number }>;
  /**
   * Deletes a single entry within an entity and namespace.
   */
  delete(
    key: EntityKey<E, P, S>,
    options?: EntityConsistencyOptions
  ): Promise<void>;
  /**
   * List entries that match a prefix within an entity and namespace.
   *
   * If namespace is not provided, only values which do not use composite keys will be returned.
   */
  query(request: EntityQueryRequest<E, P>): Promise<EntityQueryResult<E>>;
  stream(
    name: string,
    options: EntityStreamOptions,
    handler: EntityStreamHandler<Entity<E, P, S>>
  ): EntityStream<Entity<E, P, S>>;
  stream(
    name: string,
    handler: EntityStreamHandler<Entity<E, P, S>>
  ): EntityStream<Entity<E, P, S>>;
}

export interface EntityTransactItem<E extends AnyEntity = AnyEntity> {
  entity: E | string;
  operation:
    | EntitySetOperation<E>
    | EntityDeleteOperation<E>
    | EntityConditionalOperation<E>;
}

export interface EntitySetOperation<E extends AnyEntity> {
  operation: "set";
  value: EntitySchema<E>;
  options?: EntitySetOptions;
}

export interface EntityDeleteOperation<E extends AnyEntity> {
  operation: "delete";
  key: EntityKeyFromEntity<E>;
  options?: EntitySetOptions;
}

/**
 * Used in transactions, cancels the transaction if the key's version does not match.
 */
export interface EntityConditionalOperation<E extends AnyEntity> {
  operation: "condition";
  key: EntityKeyFromEntity<E>;
  version?: number;
}

export const Entity = {
  transactWrite: (items: EntityTransactItem[]): Promise<void> => {
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

export type ZodMappedSchema<E extends EntityValue> = {
  [k in keyof E]: z.Schema<E[k]>;
};

export interface EntityOptions<
  E extends EntityValue,
  P extends EntityKeyField<E>,
  S extends EntityKeyField<E> | undefined
> {
  partitionKey: EntityKeyReference<E, P>;
  sortKey?: EntityKeyReference<E, S>;
  schema: ZodMappedSchema<E>;
}

export function entity<
  E extends EntityValue,
  P extends EntityKeyField<E>,
  S extends EntityKeyField<E> | undefined
>(name: string, options: EntityOptions<E, P, S>): Entity<E, P, S> {
  if (entities().has(name)) {
    throw new Error(`entity with name '${name}' already exists`);
  }

  /**
   * Used to maintain a limited number of streams on the entity.
   */
  const streams: EntityStream<Entity<E, P, S>>[] = [];

  const entity: Entity<E, P, S> = {
    // @ts-ignore
    __entityBrand: undefined,
    kind: "Entity",
    name,
    partitionKey: options.partitionKey,
    sortKey: options.sortKey,
    schema: options.schema,
    streams,
    get: (...args) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<EntityCall<"get">>(EventualCallKind.EntityCall, {
          operation: "get",
          entityName: name,
          params: args,
        }),
        async () => {
          return getEntityHook().get(name, ...args);
        }
      );
    },
    getWithMetadata: (...args) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<EntityCall<"getWithMetadata">>(
          EventualCallKind.EntityCall,
          {
            operation: "getWithMetadata",
            entityName: name,
            params: args,
          }
        ),
        async () => {
          return getEntityHook().getWithMetadata(name, ...args);
        }
      );
    },
    set: (...args) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<EntityCall<"set">>(EventualCallKind.EntityCall, {
          entityName: name,
          operation: "set",
          params: args,
        }),
        async () => {
          return getEntityHook().set(name, ...args);
        }
      );
    },
    delete: (...args) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<EntityCall<"delete">>(EventualCallKind.EntityCall, {
          entityName: name,
          operation: "delete",
          params: args,
        }),
        async () => {
          return getEntityHook().delete(name, ...args);
        }
      );
    },
    query: (...args) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<EntityCall<"query">>(EventualCallKind.EntityCall, {
          entityName: name,
          operation: "query",
          params: args,
        }),
        async () => {
          return getEntityHook().query(name, ...args);
        }
      );
    },
    stream: (
      ...args:
        | [name: string, handler: EntityStreamHandler<Entity<E, P, S>>]
        | [
            name: string,
            options: EntityStreamOptions,
            handler: EntityStreamHandler<Entity<E, P, S>>
          ]
        | [
            sourceLocation: SourceLocation,
            name: string,
            handler: EntityStreamHandler<Entity<E, P, S>>
          ]
        | [
            sourceLocation: SourceLocation,
            name: string,
            options: EntityStreamOptions,
            handler: EntityStreamHandler<Entity<E, P, S>>
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

      const entityStream: EntityStream<Entity<E, P, S>> = {
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
}

export function entityStream<E extends AnyEntity>(
  ...args:
    | [name: string, entity: E, handler: EntityStreamHandler<E>]
    | [
        name: string,
        entity: E,
        options: EntityStreamOptions,
        handler: EntityStreamHandler<E>
      ]
    | [
        sourceLocation: SourceLocation,
        name: string,
        entity: E,
        handler: EntityStreamHandler<E>
      ]
    | [
        sourceLocation: SourceLocation,
        name: string,
        entity: E,
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
      ? [args[0], args[1] as string, args[2] as E, , args[3]]
      : [
          ,
          args[0] as string,
          args[1] as E,
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
