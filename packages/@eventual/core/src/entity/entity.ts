import { z } from "zod";
import {
  createEventualCall,
  EntityCall,
  EventualCallKind,
} from "../internal/calls.js";
import { getEntityHook } from "../internal/entity-hook.js";
import { computeKeyDefinition, KeyDefinition } from "../internal/entity.js";
import { entities } from "../internal/global.js";
import {
  EntityIndexSpec,
  EntitySpec,
  EntityStreamOptions,
  isSourceLocation,
  SourceLocation,
} from "../internal/service-spec.js";
import type { CompositeKey, CompositeKeyPart, QueryKey } from "./key.js";
import type { EntityStream, EntityStreamHandler } from "./stream.js";

export type AttributeBinaryValue =
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

type AttributeScalarValue =
  | null
  | undefined
  | bigint
  | string
  | number
  | boolean
  | AttributeBinaryValue;

export type AttributeValue =
  | Attributes
  | AttributeScalarValue
  | Set<AttributeScalarValue>
  | AttributeValue[];

export interface Attributes {
  [key: string]: AttributeValue;
}

/**
 * Turns a {@link Attributes} type into a Zod {@link z.ZodRawShape}.
 */
export type EntityZodShape<Attr extends Attributes> = {
  [key in keyof Attr]: z.ZodType<Attr[key]>;
};

/**
 * An eventual entity.
 *
 * @see entity
 */
export interface Entity<
  Attr extends Attributes = any,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> extends Omit<
    EntitySpec,
    "attributes" | "streams" | "partition" | "sort" | "indices"
  > {
  kind: "Entity";
  key: KeyDefinition;
  attributes: ZodAttributesObject<Attr>;
  indices: EntityIndex[];
  streams: EntityStream<Attr, Partition, Sort>[];
  /**
   * Get a value.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  get(
    key: CompositeKey<Attr, Partition, Sort>,
    options?: EntityReadOptions
  ): Promise<Attr | undefined>;
  /**
   * Get a value and metadata like version.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  getWithMetadata(
    key: CompositeKey<Attr, Partition, Sort>,
    options?: EntityReadOptions
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
    key: CompositeKey<Attr, Partition, Sort>,
    options?: EntityConsistencyOptions
  ): Promise<void>;
  /**
   * Query the entity using the partition key and optionally part of the sort key.
   */
  query(
    key: QueryKey<Attr, Partition, Sort>,
    request?: EntityQueryOptions
  ): Promise<EntityQueryResult<Attr>>;
  /**
   * Returns all items in the table, up to the limit given or 1MB (on AWS).
   *
   * In general, scan is an expensive operation and should be avoided in favor of query
   * unless it is necessary to get all items in a table across all or most partitions.
   */
  scan(request?: EntityQueryOptions): Promise<EntityQueryResult<Attr>>;
  index<
    const IndexPartition extends CompositeKeyPart<Attr> | undefined = undefined,
    const IndexSort extends CompositeKeyPart<Attr> | undefined = undefined
  >(
    name: string,
    options: EntityIndexOptions<Attr, IndexPartition, IndexSort>
  ): EntityIndexMapper<Attr, Partition, IndexPartition, IndexSort>;
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

/**
 * Tries the {@link Attributes} type to the computed output of the object.
 *
 * TODO: extend this type to support intersection and union.
 */
export type ZodAttributesObject<T extends Attributes> = z.ZodObject<
  any,
  any,
  any,
  T
>;

export interface EntityOptions<
  Attr extends Attributes,
  Partition extends CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined = undefined
> {
  attributes: ZodAttributesObject<Attr> | EntityZodShape<Attr>;
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
  Attr extends Attributes,
  const Partition extends CompositeKeyPart<Attr>,
  const Sort extends CompositeKeyPart<Attr> | undefined = undefined
>(
  name: string,
  options: EntityOptions<Attr, Partition, Sort>
): Entity<Attr, Partition, Sort> {
  if (entities().has(name)) {
    throw new Error(`entity with name '${name}' already exists`);
  }

  const indices: EntityIndex[] = [];

  /**
   * Used to maintain a limited number of streams on the entity.
   */
  const streams: EntityStream<Attr, Partition, Sort>[] = [];

  const attributes =
    options.attributes instanceof z.ZodObject
      ? options.attributes
      : (z.object(options.attributes) as unknown as ZodAttributesObject<Attr>);

  const entity: Entity<Attr, Partition, Sort> = {
    // @ts-ignore
    __entityBrand: undefined,
    kind: "Entity",
    name,
    key: computeKeyDefinition(attributes, options.partition, options.sort),
    attributes,
    indices,
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
    scan: (...args) => {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<EntityCall<"scan">>(EventualCallKind.EntityCall, {
          entityName: name,
          operation: "scan",
          params: args,
        }),
        async () => {
          return getEntityHook().scan(name, ...args);
        }
      );
    },
    index: (...args) => {
      const [indexName, indexOptions] = args;

      if (indices.some((i) => i.name === indexName)) {
        throw new Error(`Index of name ${indexName} already exists on ${name}`);
      }

      const index: EntityIndex = {
        kind: "EntityIndex",
        key: computeKeyDefinition(
          attributes,
          ("partition" in indexOptions ? indexOptions.partition : undefined) ??
            options.partition,
          indexOptions.sort ?? options.sort
        ),
        name: indexName,
        partition:
          "partition" in indexOptions ? indexOptions.partition : undefined,
        sort: indexOptions.sort,
        entityName: name,
        query: (...args) => {
          return getEventualCallHook().registerEventualCall(
            createEventualCall<EntityCall<"queryIndex">>(
              EventualCallKind.EntityCall,
              {
                entityName: name,
                indexName,
                operation: "queryIndex",
                params: args,
              }
            ),
            () => getEntityHook().queryIndex(name, indexName, ...args)
          );
        },
        scan: (...args) => {
          return getEventualCallHook().registerEventualCall(
            createEventualCall<EntityCall<"scanIndex">>(
              EventualCallKind.EntityCall,
              {
                entityName: name,
                indexName,
                operation: "scanIndex",
                params: args,
              }
            ),
            () => getEntityHook().scanIndex(name, indexName, ...args)
          );
        },
      };

      indices.push(index);

      return index as any;
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

  entities().set(name, entity as any);

  return entity;
}

export type EntityIndexOptions<
  Attr extends Attributes,
  Partition extends CompositeKeyPart<Attr> | undefined = undefined,
  Sort extends CompositeKeyPart<Attr> | undefined = undefined
> =
  | {
      partition: Partition;
      sort?: Sort;
    }
  | {
      sort: Sort;
    };

export type EntityIndexMapper<
  Attr extends Attributes,
  EntityPartition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  IndexPartition extends CompositeKeyPart<Attr> | undefined = undefined,
  Sort extends CompositeKeyPart<Attr> | undefined = undefined
> = IndexPartition extends undefined
  ? EntityIndex<Attr, EntityPartition, Sort>
  : EntityIndex<Attr, Exclude<IndexPartition, undefined>, Sort>;

export interface EntityIndex<
  Attr extends Attributes = any,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> extends EntityIndexSpec {
  kind: "EntityIndex";
  query(
    queryKey: QueryKey<Attr, Partition, Sort>,
    options?: EntityQueryOptions
  ): Promise<EntityQueryResult<Attr>>;
  /**
   * Returns all items in the table, up to the limit given or 1MB (on AWS).
   *
   * In general, scan is an expensive operation and should be avoided in favor of query
   * unless it is necessary to get all items in a table across all or most partitions.
   */
  scan(request?: EntityQueryOptions): Promise<EntityQueryResult<Attr>>;
}

export interface EntityQueryResult<Attr extends Attributes = Attributes> {
  entries?: EntityWithMetadata<Attr>[];
  /**
   * Returned when there are more values than the limit allowed to return.
   */
  nextToken?: string;
}

export interface EntityReadOptions {
  /**
   * when consistent read is false or undefined, a query or scan may not include the latest changes to the entity values.
   * Setting consistent read to true will increase the cost of the read and may take longer to return.
   */
  consistentRead?: boolean;
}

export interface EntityQueryOptions extends EntityReadOptions {
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

export interface EntityWithMetadata<Attr extends Attributes = Attributes> {
  value: Attr;
  version: number;
}

interface EntityTransactItemBase<
  Attr extends Attributes,
  Partition extends CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined
> {
  entity: Entity<Attr, Partition, Sort> | string;
}

export type EntityTransactItem<
  Attr extends Attributes = any,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> =
  | EntityTransactSetOperation<Attr, Partition, Sort>
  | EntityTransactDeleteOperation<Attr, Partition, Sort>
  | EntityTransactConditionalOperation<Attr, Partition, Sort>;

export interface EntityTransactSetOperation<
  Attr extends Attributes = any,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> extends EntityTransactItemBase<Attr, Partition, Sort> {
  operation: "set";
  value: Attr;
  options?: EntitySetOptions;
}

export interface EntityTransactDeleteOperation<
  Attr extends Attributes = any,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> extends EntityTransactItemBase<Attr, Partition, Sort> {
  operation: "delete";
  key: CompositeKey<Attr, Partition, Sort>;
  options?: EntitySetOptions;
}

/**
 * Used in transactions, cancels the transaction if the key's version does not match.
 */
export interface EntityTransactConditionalOperation<
  Attr extends Attributes = any,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> extends EntityTransactItemBase<Attr, Partition, Sort> {
  operation: "condition";
  key: CompositeKey<Attr, Partition, Sort>;
  version?: number;
}