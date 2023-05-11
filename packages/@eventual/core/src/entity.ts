import { z } from "zod";
import {
  createEventualCall,
  EntityCall,
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
import type { ServiceContext } from "./service.js";

export interface EntityQueryResult<Attr extends EntityAttributes> {
  entries?: EntityWithMetadata<Attr>[];
  /**
   * Returned when there are more values than the limit allowed to return.
   */
  nextToken?: string;
}

/**
 * A partial key that can be used to query an entity.
 *
 * ```ts
 * entity.query({ part1: "val", part2: "val2", sort1: "val" });
 * ```
 *
 * TODO: support expressions like between and starts with on sort properties
 * TODO: support a progressive builder instead of a simple partial.
 */
export type EntityQueryKey<
  Attr extends EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined
> = Partial<EntityCompositeKey<Attr, Partition, Sort>>;

export interface EntityQueryOptions {
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

export interface EntityStreamHandler<
  Attr extends EntityAttributes = EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> {
  /**
   * Provides the keys, new value
   */
  (
    item: EntityStreamItem<Attr, Partition, Sort>,
    context: EntityStreamContext
  ): Promise<void | false> | void | false;
}

export interface EntityStreamItemBase<
  Attr extends EntityAttributes = EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> {
  streamName: string;
  entityName: string;
  key: EntityKeyMap<Attr, Partition, Sort>;
}

export type EntityStreamItem<
  Attr extends EntityAttributes = EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> =
  | EntityStreamInsertItem<Attr, Partition, Sort>
  | EntityStreamModifyItem<Attr, Partition, Sort>
  | EntityStreamRemoveItem<Attr, Partition, Sort>;

export interface EntityStreamInsertItem<
  Attr extends EntityAttributes = EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> extends EntityStreamItemBase<Attr, Partition, Sort> {
  newValue: Attr;
  newVersion: number;
  operation: "insert";
}

export interface EntityStreamModifyItem<
  Attr extends EntityAttributes = EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> extends EntityStreamItemBase<Attr, Partition, Sort> {
  operation: "modify";
  newValue: Attr;
  newVersion: number;
  oldValue?: Attr;
  oldVersion?: number;
}

export interface EntityStreamRemoveItem<
  Attr extends EntityAttributes = EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> extends EntityStreamItemBase<Attr, Partition, Sort> {
  operation: "remove";
  oldValue?: Attr;
  oldVersion?: number;
}

export interface EntityStream<
  Attr extends EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined
> extends EntityStreamSpec<Attr, Partition, Sort> {
  kind: "EntityStream";
  handler: EntityStreamHandler<Attr, Partition, Sort>;
  sourceLocation?: SourceLocation;
}

export type AnyEntity = Entity<
  any,
  readonly string[],
  readonly string[] | undefined
>;

export type EntityKeyType = string | number;

/**
 * A part of the composite key, either the partition or sort key.
 */
export type EntityCompositeKeyPart<Attr extends EntityAttributes> =
  readonly EntityKeyAttribute<Attr>[];

/**
 * Any attribute name considered to be a valid key attribute.
 */
export type EntityKeyAttribute<Attr extends EntityAttributes> = {
  [K in keyof Attr]: K extends string
    ? // only include fields that extend string or number
      Attr[K] extends EntityKeyType
      ? K
      : never
    : never;
}[keyof Attr];

/**
 * Extracts an {@link EntityKeyMap} from an {@link Entity} type.
 */
export type EntityCompositeKeyMapFromEntity<E extends AnyEntity> =
  E extends Entity<infer Attributes, infer Partition, infer Sort>
    ? EntityKeyMap<Attributes, Partition, Sort>
    : never;

/**
 * Extracts an {@link EntityCompositeKey} from an {@link Entity} type.
 */
export type EntityKeyFromEntity<E extends AnyEntity> = E extends Entity<
  infer Attributes,
  infer Partition,
  infer Sort
>
  ? EntityCompositeKey<Attributes, Partition, Sort>
  : never;

/**
 * All attributes of the composite key as an object.
 *
 * ```ts
 * {
 *   partitionAttribute1: "",
 *   partitionAttribute2: "",
 *   sortAttribute1: "",
 *   sortAttribute2: ""
 * }
 * ```
 */
export type EntityKeyMap<
  Attr extends EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined
> = {
  [k in Partition[number]]: Attr[k];
} & (Sort extends readonly (keyof Attr)[]
  ? {
      [k in Sort[number]]: Attr[k];
    }
  : // eslint-disable-next-line
    {});

export type EntityKeyPartialTuple<
  Attr extends EntityAttributes,
  Fields extends readonly (keyof Attr)[]
> = Fields extends readonly [
  infer Head extends keyof Attr,
  ...infer Rest extends readonly (keyof Attr)[]
]
  ? readonly [Attr[Head], ...EntityKeyPartialTuple<Attr, Rest>]
  : Fields extends readonly [infer Head extends keyof Attr]
  ? readonly [Attr[Head]]
  : readonly [];

/**
 * All attributes of the composite key as a in order tuple.
 *
 * ```ts
 * [partitionAttribute1, partitionAttribute2, sortAttribute1, sortAttribute2]
 * ```
 */
export type EntityKeyTuple<
  Attr extends EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined
> = Sort extends undefined
  ? EntityKeyPartialTuple<Attr, Partition>
  : readonly [
      ...EntityKeyPartialTuple<Attr, Partition>,
      ...EntityKeyPartialTuple<Attr, Exclude<Sort, undefined>>
    ];

/**
 * All attributes in either the partition key and the sort key (when present).
 */
export type EntityCompositeKey<
  Attr extends EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined
> = EntityKeyMap<Attr, Partition, Sort> | EntityKeyTuple<Attr, Partition, Sort>;

export type AnyEntityCompositeKey = EntityCompositeKey<
  any,
  readonly string[],
  readonly string[] | undefined
>;

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

export type EntityAttributesFromEntity<E extends AnyEntity> = E extends Entity<
  infer Attributes,
  any,
  any
>
  ? Attributes
  : never;

export interface EntityWithMetadata<Attr extends EntityAttributes> {
  value: Attr;
  version: number;
}

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
  | EntityAttributes
  | string
  | number
  | boolean
  | EntityBinaryMember
  | Set<string | number | boolean | EntityBinaryMember>
  | EntityValueMember[];

export type EntityAttributes = {
  [key: string]: EntityValueMember;
};

/**
 * Turns a {@link EntityAttributes} type into a Zod {@link z.ZodRawShape}.
 */
export type EntityZodShape<Attr extends EntityAttributes> = {
  [key in keyof Attr]: z.ZodType<Attr[key]>;
};

/**
 * A map of zod types or a {@link z.ZodObject}.
 */
export type EntityZodAttributes<Attr extends EntityAttributes> =
  | z.ZodObject<EntityZodShape<Attr>>
  | EntityZodShape<Attr>;

/**
 * An eventual entity.
 *
 * @see entity
 */
export interface Entity<
  Attr extends EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined
> extends Omit<EntitySpec, "attributes" | "streams" | "partition" | "sort"> {
  kind: "Entity";
  partition: Partition;
  sort?: Sort;
  attributes: z.ZodObject<EntityZodShape<Attr>>;
  streams: EntityStream<Attr, Partition, Sort>[];
  /**
   * Get a value.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  get(
    key: EntityCompositeKey<Attr, Partition, Sort>
  ): Promise<Attr | undefined>;
  /**
   * Get a value and metadata like version.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  getWithMetadata(
    key: EntityCompositeKey<Attr, Partition, Sort>
  ): Promise<EntityWithMetadata<Attr> | undefined>;
  /**
   * Sets or updates a value within an entity and optionally a namespace.
   *
   * Values with namespaces are considered distinct from value without a namespace or within different namespaces.
   * Values and keys can only be listed within a single namespace.
   */
  set(entity: Attr, options?: EntitySetOptions): Promise<{ version: number }>;
  /**
   * Deletes a single entry within an entity and namespace.
   */
  delete(
    key: EntityCompositeKey<Attr, Partition, Sort>,
    options?: EntityConsistencyOptions
  ): Promise<void>;
  /**
   * List entries that match a prefix within an entity and namespace.
   *
   * If namespace is not provided, only values which do not use composite keys will be returned.
   */
  query(
    key: EntityQueryKey<Attr, Partition, Sort>,
    request?: EntityQueryOptions
  ): Promise<EntityQueryResult<Attr>>;
  stream(
    name: string,
    options: EntityStreamOptions<Attr, Partition, Sort>,
    handler: EntityStreamHandler<Attr, Partition, Sort>
  ): EntityStream<Attr, Partition, Sort>;
  stream(
    name: string,
    handler: EntityStreamHandler<Attr, Partition, Sort>
  ): EntityStream<Attr, Partition, Sort>;
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
  value: EntityAttributesFromEntity<E>;
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

export interface EntityOptions<
  Attr extends EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined
> {
  attributes: EntityZodAttributes<Attr>;
  partition: Partition;
  sort?: Sort;
}

/**
 * Creates an entity which holds data.
 *
 * An entity's keys are made up of one or more attributes in the entity.
 * When an entity's key is made up of more than one attribute, it is considered to be a composite key.
 *
 * Each attribute of the composite key is considered to be either a partition key or a sort key, which we consider a composite key part.
 * Each entity is required to at least have one partition key attribute, but may have may partition and or sort key attributes.
 * To retrieve a single value with an entity, the entire composite key must be used, until the query operation is used to return multiple entities (within a partition).
 *
 * A partition key separates data within an entity. When using the Query operation, data can only be queried within
 * a single partition.
 *
 * A sort key determines the order of the values when running a query. It also allows for ranges of values to be queried
 * using only some of the sort key attributes (in order).
 *
 * ```ts
 * // lets take an example where we have posts for a user, separated by forum.
 * const userComments = entity("userComments", {
 *    attributes: {
 *       forum: z.string(),
 *       userId: z.string(),
 *       postId: z.string(),
 *       commentId: z.string(),
 *       message: z.string()
 *    },
 *    partition: ["forum", "userId"],
 *    sort: ["postId", "id"],
 * });
 *
 * // add a new post comment
 * await userComments.set({
 *    forum: "games",
 *    userId: "1",
 *    postId: "100",
 *    commentId: "abc",
 *    message: "I love games"
 * });
 *
 * // get all comments for a user in a forum
 * await userComments.query({
 *    forum: "games", // required in the query
 *    userId: "1", // required in the query
 * });
 *
 * // get all comments for a user in a forum and a post
 * await userComments.query({
 *    forum: "games", // required in the query
 *    userId: "1", // required in the query
 *    post: "100", // optional in the query
 * });
 *
 * // get a single post
 * await userComments.get({
 *    forum: "games",
 *    userId: "1",
 *    postId: "100",
 *    commentId: "abc"
 * });
 * ```
 */
export function entity<
  Attr extends EntityAttributes,
  const Partition extends EntityCompositeKeyPart<Attr>,
  const Sort extends EntityCompositeKeyPart<Attr> | undefined
>(
  name: string,
  options: EntityOptions<Attr, Partition, Sort>
): Entity<Attr, Partition, Sort> {
  if (entities().has(name)) {
    throw new Error(`entity with name '${name}' already exists`);
  }

  /**
   * Used to maintain a limited number of streams on the entity.
   */
  const streams: EntityStream<Attr, Partition, Sort>[] = [];

  const entity: Entity<Attr, Partition, Sort> = {
    // @ts-ignore
    __entityBrand: undefined,
    kind: "Entity",
    name,
    partition: options.partition,
    sort: options.sort,
    attributes:
      options.attributes instanceof z.ZodObject
        ? options.attributes
        : z.object(options.attributes),
    streams,
    get: (...args) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<EntityCall<"get">>(EventualCallKind.EntityCall, {
          operation: "get",
          entityName: name,
          params: args,
        }),
        async () => {
          return getEntityHook().get(name, ...args) as Promise<Attr>;
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
        | [name: string, handler: EntityStreamHandler<Attr, Partition, Sort>]
        | [
            name: string,
            options: EntityStreamOptions<Attr, Partition, Sort>,
            handler: EntityStreamHandler<Attr, Partition, Sort>
          ]
        | [
            sourceLocation: SourceLocation,
            name: string,
            handler: EntityStreamHandler<Attr, Partition, Sort>
          ]
        | [
            sourceLocation: SourceLocation,
            name: string,
            options: EntityStreamOptions<Attr, Partition, Sort>,
            handler: EntityStreamHandler<Attr, Partition, Sort>
          ]
    ) => {
      const [sourceLocation, streamName, options, handler] =
        args.length === 2
          ? [, args[0], , args[1]]
          : args.length === 4
          ? args
          : isSourceLocation(args[0]) && typeof args[1] === "string"
          ? [args[0], args[1] as string, , args[2]]
          : [
              ,
              args[0] as string,
              args[1] as EntityStreamOptions<Attr, Partition, Sort>,
              args[2],
            ];

      if (streams.length > 1) {
        throw new Error("Only two streams are allowed per entity.");
      }

      const entityStream: EntityStream<Attr, Partition, Sort> = {
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

export function entityStream<
  Attr extends EntityAttributes,
  const Partition extends EntityCompositeKeyPart<Attr>,
  const Sort extends EntityCompositeKeyPart<Attr> | undefined
>(
  ...args:
    | [
        name: string,
        entity: Entity<Attr, Partition, Sort>,
        handler: EntityStreamHandler<Attr, Partition, Sort>
      ]
    | [
        name: string,
        entity: Entity<Attr, Partition, Sort>,
        options: EntityStreamOptions<Attr, Partition, Sort>,
        handler: EntityStreamHandler<Attr, Partition, Sort>
      ]
    | [
        sourceLocation: SourceLocation,
        name: string,
        entity: Entity<Attr, Partition, Sort>,
        handler: EntityStreamHandler<Attr, Partition, Sort>
      ]
    | [
        sourceLocation: SourceLocation,
        name: string,
        entity: Entity<Attr, Partition, Sort>,
        options: EntityStreamOptions<Attr, Partition, Sort>,
        handler: EntityStreamHandler<Attr, Partition, Sort>
      ]
) {
  const [sourceLocation, name, entity, options, handler] =
    args.length === 3
      ? [, args[0], args[1], , args[2]]
      : args.length === 5
      ? args
      : isSourceLocation(args[0])
      ? [
          args[0],
          args[1] as string,
          args[2] as Entity<Attr, Partition, Sort>,
          ,
          args[3],
        ]
      : [
          ,
          args[0] as string,
          args[1] as Entity<Attr, Partition, Sort>,
          args[2] as EntityStreamOptions<Attr, Partition, Sort>,
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
