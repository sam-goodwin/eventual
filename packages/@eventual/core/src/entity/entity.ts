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

export type AttributeValue =
  | Attributes
  | string
  | number
  | boolean
  | AttributeBinaryValue
  | Set<string | number | boolean | AttributeBinaryValue>
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
> extends Omit<EntitySpec, "attributes" | "streams" | "partition" | "sort"> {
  kind: "Entity";
  key: KeyDefinition;
  attributes: z.ZodObject<EntityZodShape<Attr>>;
  streams: EntityStream<Attr, Partition, Sort>[];
  /**
   * Get a value.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  get(key: CompositeKey<Attr, Partition, Sort>): Promise<Attr | undefined>;
  /**
   * Get a value and metadata like version.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  getWithMetadata(
    key: CompositeKey<Attr, Partition, Sort>
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
   * List entries that match a prefix within an entity and namespace.
   *
   * If namespace is not provided, only values which do not use composite keys will be returned.
   */
  query(
    key: QueryKey<Attr, Partition, Sort>,
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

export interface EntityTransactItem<
  Attr extends Attributes = any,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> {
  entity: Entity<Attr, Partition, Sort> | string;
  operation:
    | EntitySetOperation<Attr>
    | EntityDeleteOperation<Attr, Partition, Sort>
    | EntityConditionalOperation<Attr, Partition, Sort>;
}

export interface EntitySetOperation<Attr extends Attributes = any> {
  operation: "set";
  value: Attr;
  options?: EntitySetOptions;
}

export interface EntityDeleteOperation<
  Attr extends Attributes = any,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> {
  operation: "delete";
  key: CompositeKey<Attr, Partition, Sort>;
  options?: EntitySetOptions;
}

/**
 * Used in transactions, cancels the transaction if the key's version does not match.
 */
export interface EntityConditionalOperation<
  Attr extends Attributes = any,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> {
  operation: "condition";
  key: CompositeKey<Attr, Partition, Sort>;
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
  Attr extends Attributes,
  Partition extends CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined = undefined
> {
  attributes: z.ZodObject<EntityZodShape<Attr>> | EntityZodShape<Attr>;
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

  /**
   * Used to maintain a limited number of streams on the entity.
   */
  const streams: EntityStream<Attr, Partition, Sort>[] = [];

  const attributes =
    options.attributes instanceof z.ZodObject
      ? options.attributes
      : z.object(options.attributes);

  const entity: Entity<Attr, Partition, Sort> = {
    // @ts-ignore
    __entityBrand: undefined,
    kind: "Entity",
    name,
    key: computeKeyDefinition(attributes, options.partition, options.sort),
    attributes,
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

  entities().set(name, entity as any);

  return entity;
}

export interface EntityQueryResult<Attr extends Attributes = Attributes> {
  entries?: EntityWithMetadata<Attr>[];
  /**
   * Returned when there are more values than the limit allowed to return.
   */
  nextToken?: string;
}

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

export interface EntityWithMetadata<Attr extends Attributes = Attributes> {
  value: Attr;
  version: number;
}
