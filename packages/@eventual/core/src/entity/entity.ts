import { z } from "zod";
import { createCall, EntityCall, CallKind } from "../internal/calls.js";
import { computeKeyDefinition, KeyDefinition } from "../internal/entity.js";
import { registerEventualResource } from "../internal/resources.js";
import {
  EntityIndexSpec,
  EntitySpec,
  EntityStreamOperation,
  EntityStreamOptions,
  isSourceLocation,
  SourceLocation,
} from "../internal/service-spec.js";
import { SetOptionalFields } from "../type-utils.js";
import type {
  CompositeKey,
  EntityCompositeKeyPart,
  IndexCompositeKeyPart,
  KeyAttributes,
  QueryKey,
} from "./key.js";
import type {
  EntityBatchStream,
  EntityBatchStreamHandler,
  EntityStream,
  EntityStreamHandler,
} from "./stream.js";

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
  Name extends string = string,
  Attr extends Attributes = any,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> extends Omit<
    EntitySpec<Name>,
    "attributes" | "streams" | "partition" | "sort" | "indices"
  > {
  kind: "Entity";
  key: KeyDefinition;
  attributes: ZodAttributesObject<Attr>;
  indices: EntityIndex[];
  streams: (
    | EntityBatchStream<any, Attr, Partition, Sort>
    | EntityStream<any, Attr, Partition, Sort>
  )[];
  /**
   * Get a value.
   *
   * @param key - {@link CompositeKey} of the value to retrieve.
   */
  get(
    key: CompositeKey<Attr, Partition, Sort>,
    options?: EntityReadOptions
  ): Promise<Attr | undefined>;
  /**
   * Get a value and metadata like version.
   *
   * @param key - {@link CompositeKey} of the value to retrieve.
   */
  getWithMetadata(
    key: CompositeKey<Attr, Partition, Sort>,
    options?: EntityReadOptions
  ): Promise<EntityWithMetadata<Attr> | undefined>;
  /**
   * Puts a value into an entity at a key.
   */
  put(
    entity: SetOptionalFields<Attr>,
    options?: EntityPutOptions
  ): Promise<{ version: number }>;
  /**
   * Deletes a single entry within an entity.
   */
  delete(
    key: CompositeKey<Attr, Partition, Sort>,
    options?: EntityConsistencyOptions
  ): Promise<void>;
  /**
   * Query the entity using the partition key and optionally part of the sort key.
   */
  query<const Select extends EntityQuerySelect<Attr> | undefined = undefined>(
    key: QueryKey<Attr, Partition, Sort>,
    request?: EntityQueryOptions<Attr, Select>
  ): Promise<EntityQueryResult<Attr, Select>>;
  /**
   * Returns all items in the table, up to the limit given or 1MB (on AWS).
   *
   * In general, scan is an expensive operation and should be avoided in favor of query
   * unless it is necessary to get all items in a table across all or most partitions.
   */
  scan<const Select extends EntityQuerySelect<Attr> | undefined = undefined>(
    request?: EntityScanOptions<Attr, Select>
  ): Promise<EntityQueryResult<Attr, Select>>;
  index<
    Name extends string = string,
    const IndexPartition extends
      | IndexCompositeKeyPart<Attr>
      | undefined = undefined,
    const IndexSort extends IndexCompositeKeyPart<Attr> | undefined = undefined
  >(
    name: Name,
    options: EntityIndexOptions<Attr, IndexPartition, IndexSort>
  ): EntityIndexMapper<Name, Attr, Partition, IndexPartition, IndexSort>;
  stream<
    Name extends string = string,
    Operations extends EntityStreamOperation[] = EntityStreamOperation[],
    IncludeOld extends boolean = false
  >(
    name: Name,
    options: EntityStreamOptions<Attr, Partition, Sort, Operations, IncludeOld>,
    handler: EntityStreamHandler<Attr, Partition, Sort, Operations, IncludeOld>
  ): EntityStream<Name, Attr, Partition, Sort>;
  stream<Name extends string = string>(
    name: string,
    handler: EntityStreamHandler<Attr, Partition, Sort>
  ): EntityStream<Name, Attr, Partition, Sort>;
  batchStream<
    Name extends string = string,
    Operations extends EntityStreamOperation[] = EntityStreamOperation[]
  >(
    name: Name,
    options: EntityStreamOptions<Attr, Partition, Sort, Operations>,
    handler: EntityBatchStreamHandler<Attr, Partition, Sort, Operations>
  ): EntityBatchStream<Name, Attr, Partition, Sort>;
  batchStream<Name extends string = string>(
    name: string,
    handler: EntityBatchStreamHandler<Attr, Partition, Sort>
  ): EntityBatchStream<Name, Attr, Partition, Sort>;
}

export const Entity = {
  transactWrite: (items: EntityTransactItem[]): Promise<void> => {
    return getEventualHook().executeEventualCall(
      createCall<EntityCall<"transact">>(CallKind.EntityCall, {
        operation: {
          operation: "transact",
          items: items.map((i) => {
            return {
              ...i,
              entity: typeof i.entity === "string" ? i.entity : i.entity.name,
            };
          }),
        },
      })
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
  Partition extends EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined = undefined
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
 * await userComments.put({
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
  Name extends string,
  Attr extends Attributes,
  const Partition extends EntityCompositeKeyPart<Attr>,
  const Sort extends EntityCompositeKeyPart<Attr> | undefined = undefined
>(
  name: Name,
  options: EntityOptions<Attr, Partition, Sort>
): Entity<Name, Attr, Partition, Sort> {
  const indices: EntityIndex[] = [];

  /**
   * Used to maintain a limited number of streams on the entity.
   */
  const streams: (
    | EntityStream<any, Attr, Partition, Sort>
    | EntityBatchStream<any, Attr, Partition, Sort>
  )[] = [];

  const attributes =
    options.attributes instanceof z.ZodObject
      ? options.attributes
      : (z.object(options.attributes) as unknown as ZodAttributesObject<Attr>);

  const entity: Entity<Name, Attr, Partition, Sort> = {
    // @ts-ignore
    __entityBrand: undefined,
    kind: "Entity",
    name,
    key: computeKeyDefinition(attributes, options.partition, options.sort),
    attributes,
    indices,
    streams,
    get: (...args) => {
      return getEventualHook().executeEventualCall(
        createCall<EntityCall<"get">>(CallKind.EntityCall, {
          operation: { operation: "get", entityName: name, params: args },
        })
      );
    },
    getWithMetadata: (...args) => {
      return getEventualHook().executeEventualCall(
        createCall<EntityCall<"getWithMetadata">>(CallKind.EntityCall, {
          operation: {
            operation: "getWithMetadata",
            entityName: name,
            params: args,
          },
        })
      );
    },
    put: (...args) => {
      return getEventualHook().executeEventualCall(
        createCall<EntityCall<"put">>(CallKind.EntityCall, {
          operation: { entityName: name, operation: "put", params: args },
        })
      );
    },
    delete: (...args) => {
      return getEventualHook().executeEventualCall(
        createCall<EntityCall<"delete">>(CallKind.EntityCall, {
          operation: { entityName: name, operation: "delete", params: args },
        })
      );
    },
    query: (...args) => {
      return getEventualHook().executeEventualCall(
        createCall<EntityCall<"query">>(CallKind.EntityCall, {
          operation: { entityName: name, operation: "query", params: args },
        })
      );
    },
    scan: (...args) => {
      return getEventualHook().executeEventualCall(
        createCall<EntityCall<"scan">>(CallKind.EntityCall, {
          operation: { entityName: name, operation: "scan", params: args },
        })
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
          return getEventualHook().executeEventualCall(
            createCall<EntityCall<"queryIndex">>(CallKind.EntityCall, {
              operation: {
                entityName: name,
                indexName,
                operation: "queryIndex",
                params: args,
              },
            })
          );
        },
        scan: (...args) => {
          return getEventualHook().executeEventualCall(
            createCall<EntityCall<"scanIndex">>(CallKind.EntityCall, {
              operation: {
                entityName: name,
                indexName,
                operation: "scanIndex",
                params: args,
              },
            })
          );
        },
      };

      indices.push(index);

      return index as any;
    },
    stream: (...args: any[]) => {
      return addStream<EntityStream<any, Attr, Partition, Sort>>(
        "EntityStream",
        ...(args as any)
      );
    },
    batchStream: (...args: any[]) => {
      return addStream<EntityBatchStream<any, Attr, Partition, Sort>>(
        "EntityBatchStream",
        ...(args as any)
      );
    },
  };

  return registerEventualResource("Entity", entity);

  function addStream<
    E extends
      | EntityStream<any, Attr, Partition, Sort>
      | EntityBatchStream<any, Attr, Partition, Sort>
  >(
    kind: E["kind"],
    ...args:
      | [
          name: string,
          handler:
            | EntityStreamHandler<Attr, Partition, Sort>
            | EntityBatchStreamHandler<Attr, Partition, Sort>
        ]
      | [
          name: string,
          options: EntityStreamOptions<Attr, Partition, Sort>,
          handler:
            | EntityStreamHandler<Attr, Partition, Sort>
            | EntityBatchStreamHandler<Attr, Partition, Sort>
        ]
      | [
          sourceLocation: SourceLocation,
          name: string,
          handler:
            | EntityStreamHandler<Attr, Partition, Sort>
            | EntityBatchStreamHandler<Attr, Partition, Sort>
        ]
      | [
          sourceLocation: SourceLocation,
          name: string,
          options: EntityStreamOptions<Attr, Partition, Sort>,
          handler:
            | EntityStreamHandler<Attr, Partition, Sort>
            | EntityBatchStreamHandler<Attr, Partition, Sort>
        ]
  ): E {
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

    const entityStream = {
      kind,
      handler,
      name: streamName,
      entityName: name,
      options,
      sourceLocation,
    } as unknown as E;

    streams.push(entityStream);

    return entityStream;
  }
}

export type EntityIndexOptions<
  Attr extends Attributes,
  Partition extends IndexCompositeKeyPart<Attr> | undefined = undefined,
  Sort extends IndexCompositeKeyPart<Attr> | undefined = undefined
> =
  | {
      partition: Partition;
      sort?: Sort;
    }
  | {
      sort: Sort;
    };

export type EntityIndexMapper<
  Name extends string,
  Attr extends Attributes,
  EntityPartition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  IndexPartition extends IndexCompositeKeyPart<Attr> | undefined = undefined,
  Sort extends IndexCompositeKeyPart<Attr> | undefined = undefined
> = IndexPartition extends undefined
  ? EntityIndex<Name, Attr, EntityPartition, Sort>
  : EntityIndex<Name, Attr, Exclude<IndexPartition, undefined>, Sort>;

/**
 * An index's key attributes are never undefined.
 */
export type EntityIndexAttributes<
  Attr extends Attributes,
  Partition extends IndexCompositeKeyPart<Attr> = IndexCompositeKeyPart<Attr>,
  Sort extends IndexCompositeKeyPart<Attr> | undefined =
    | IndexCompositeKeyPart<Attr>
    | undefined
> = {
  [k in keyof Attr]: k extends KeyAttributes<Attr, Partition, Sort>
    ? Exclude<Attr[k], undefined>
    : Attr[k];
};

export interface EntityIndex<
  Name extends string = string,
  EntityAttr extends Attributes = Attributes,
  Partition extends IndexCompositeKeyPart<EntityAttr> = IndexCompositeKeyPart<EntityAttr>,
  Sort extends IndexCompositeKeyPart<EntityAttr> | undefined =
    | IndexCompositeKeyPart<EntityAttr>
    | undefined,
  IndexAttr extends EntityIndexAttributes<
    EntityAttr,
    Partition,
    Sort
  > = EntityIndexAttributes<EntityAttr, Partition, Sort>
> extends EntityIndexSpec<Name> {
  kind: "EntityIndex";
  query<Select extends EntityQuerySelect<IndexAttr> | undefined = undefined>(
    queryKey: QueryKey<IndexAttr, Partition, Sort>,
    options?: EntityQueryOptions<IndexAttr, Select>
  ): Promise<EntityQueryResult<IndexAttr, Select>>;
  /**
   * Returns all items in the table, up to the limit given or 1MB (on AWS).
   *
   * In general, scan is an expensive operation and should be avoided in favor of query
   * unless it is necessary to get all items in a table across all or most partitions.
   */
  scan<Select extends EntityQuerySelect<IndexAttr> | undefined = undefined>(
    request?: EntityScanOptions<IndexAttr, Select>
  ): Promise<EntityQueryResult<IndexAttr, Select>>;
}

export interface EntityQueryResult<
  Attr extends Attributes = Attributes,
  Select extends EntityQuerySelect<Attr> | undefined = undefined
> {
  entries?: EntityWithMetadata<SelectedAttributes<Attr, Select>>[];
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

export type EntityQuerySelect<Attr extends Attributes> =
  readonly (keyof Attr)[];

export interface EntityScanOptions<
  EntityAttr extends Attributes = Attributes,
  Select extends EntityQuerySelect<EntityAttr> | undefined = undefined
> extends EntityReadOptions {
  /**
   * Number of items to retrieve
   * @default 100
   */
  limit?: number;
  nextToken?: string;
  /**
   * Attributes to return in the query or scan.
   *
   * @default - all attributes are returned for each item in the query/scan.
   */
  select?: Select;
}

export interface EntityQueryOptions<
  EntityAttr extends Attributes = Attributes,
  Select extends EntityQuerySelect<EntityAttr> | undefined = undefined
> extends EntityScanOptions<EntityAttr, Select> {
  /**
   * Determines the direction of the items returned in the query based on the sort key.
   *
   * @default ASC - ascending order
   */
  direction?: "ASC" | "DESC";
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

export interface EntityPutOptions extends EntityConsistencyOptions {
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

export type SelectedAttributes<
  Attr extends Attributes = Attributes,
  Select = EntityQuerySelect<Attr> | undefined
> = Select extends EntityQuerySelect<Attr> ? Pick<Attr, Select[number]> : Attr;

interface EntityTransactItemBase<
  Attr extends Attributes,
  Partition extends EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined
> {
  entity: Entity<any, Attr, Partition, Sort> | string;
}

export type EntityTransactItem<
  Attr extends Attributes = any,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> =
  | EntityTransactPutOperation<Attr, Partition, Sort>
  | EntityTransactDeleteOperation<Attr, Partition, Sort>
  | EntityTransactConditionalOperation<Attr, Partition, Sort>;

export interface EntityTransactPutOperation<
  Attr extends Attributes = any,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> extends EntityTransactItemBase<Attr, Partition, Sort> {
  operation: "put";
  value: Attr;
  options?: EntityPutOptions;
}

export interface EntityTransactDeleteOperation<
  Attr extends Attributes = any,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> extends EntityTransactItemBase<Attr, Partition, Sort> {
  operation: "delete";
  key: CompositeKey<Attr, Partition, Sort>;
  options?: EntityPutOptions;
}

/**
 * Used in transactions, cancels the transaction if the key's version does not match.
 */
export interface EntityTransactConditionalOperation<
  Attr extends Attributes = any,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> extends EntityTransactItemBase<Attr, Partition, Sort> {
  operation: "condition";
  key: CompositeKey<Attr, Partition, Sort>;
  version?: number;
}
