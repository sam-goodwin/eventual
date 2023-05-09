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

export interface EntityQueryResultEntry<E extends EntityAttributes> {
  entity: E;
  version: number;
}

export interface EntityQueryResult<E extends EntityAttributes> {
  entries?: EntityQueryResultEntry<E>[];
  /**
   * Returned when there are more values than the limit allowed to return.
   */
  nextToken?: string;
}

export type EntityCompositeKeyPart<E extends EntityAttributes> =
  readonly EntityKeyField<E>[];

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
  E extends EntityAttributes,
  Partition extends EntityCompositeKeyPart<E>,
  Sort extends EntityCompositeKeyPart<E> | undefined
> = Partial<EntityKey<E, Partition, Sort>>;

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
  key: EntityCompositeKey<Attr, Partition, Sort>;
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
  newValue: z.infer<z.ZodObject<Attr>>;
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
  newValue: z.infer<z.ZodObject<Attr>>;
  newVersion: number;
  oldValue?: z.infer<z.ZodObject<Attr>>;
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
  oldValue?: z.infer<z.ZodObject<Attr>>;
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
export type EntityKeyZodType = z.ZodString | z.ZodNumber;

export type EntityKeyField<E extends EntityAttributes> = {
  [K in keyof E]: K extends string
    ? // only include fields that extend string or number
      z.infer<E[K]> extends EntityKeyType
      ? K
      : never
    : never;
}[keyof E];

export type EntityCompositeKeyFromEntity<E extends AnyEntity> =
  E extends Entity<infer Attributes, infer Partition, infer Sort>
    ? EntityCompositeKey<Attributes, Partition, Sort>
    : never;

export type EntityKeyFromEntity<E extends AnyEntity> = E extends Entity<
  infer Attributes,
  infer Partition,
  infer Sort
>
  ? EntityKey<Attributes, Partition, Sort>
  : never;

export type EntityCompositeKey<
  Attr extends EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined
> = {
  [k in Partition[number]]: z.infer<Attr[k]>;
} & (Sort extends readonly (keyof Attr)[]
  ? {
      [k in Sort[number]]: z.infer<Attr[k]>;
    }
  : // eslint-disable-next-line
    {});

// const T = { n: z.string(), m: z.string(), x: z.number() };
// type X = EntityKey<typeof T, ["n"], ["m", "x"]>;
// const x: X = ["hello", "hello", 1];

export type EntityKeyArray<
  E extends EntityAttributes,
  Fields extends readonly (keyof E)[]
> = Fields extends readonly [
  infer X extends keyof E,
  ...infer Rest extends readonly (keyof E)[]
]
  ? readonly [z.infer<E[X]>, ...EntityKeyArray<E, Rest>]
  : Fields extends readonly [infer X extends keyof E]
  ? readonly [z.infer<E[X]>]
  : readonly [];

export type EntityKeyTuple<
  E extends EntityAttributes,
  Partition extends EntityCompositeKeyPart<E>,
  Sort extends EntityCompositeKeyPart<E> | undefined
> = Sort extends undefined
  ? EntityKeyArray<E, Partition>
  : readonly [
      ...EntityKeyArray<E, Partition>,
      ...EntityKeyArray<E, Exclude<Sort, undefined>>
    ];

export type EntityKey<
  E extends EntityAttributes,
  Partition extends EntityCompositeKeyPart<E>,
  Sort extends EntityCompositeKeyPart<E> | undefined
> = EntityCompositeKey<E, Partition, Sort> | EntityKeyTuple<E, Partition, Sort>;

export type AnyEntityKey = EntityKey<
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

export interface EntityWithMetadata<E extends EntityAttributes> {
  value: z.infer<z.ZodObject<E>>;
  version: number;
}

export type AttributeNames<Attr extends EntityZodAttributes> =
  Attr extends z.ZodObject<infer A> ? keyof A : keyof Attr;

export type AttributeShape<Attr extends EntityZodAttributes> =
  Attr extends z.ZodObject<infer A>
    ? {
        [k in keyof A]: A[k];
      }
    : Attr;

export type EntityAttributes = {
  [attribute in string]: z.ZodType;
};

export type EntityZodAttributes =
  | z.ZodObject<EntityAttributes>
  | EntityAttributes;

export interface Entity<
  Attr extends EntityAttributes,
  P extends EntityCompositeKeyPart<Attr>,
  S extends EntityCompositeKeyPart<Attr> | undefined
> extends Omit<EntitySpec, "attributes" | "streams" | "partition" | "sort"> {
  kind: "Entity";
  partition: P;
  sort?: S;
  attributes: z.ZodObject<Attr>;
  streams: EntityStream<Attr, P, S>[];
  /**
   * Get a value.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  get(
    key: EntityKey<Attr, P, S>
  ): Promise<z.infer<z.ZodObject<Attr>> | undefined>;
  /**
   * Get a value and metadata like version.
   * If your values use composite keys, the namespace must be provided.
   *
   * @param key - key or {@link CompositeKey} of the value to retrieve.
   */
  getWithMetadata(
    key: EntityKey<Attr, P, S>
  ): Promise<EntityWithMetadata<Attr> | undefined>;
  /**
   * Sets or updates a value within an entity and optionally a namespace.
   *
   * Values with namespaces are considered distinct from value without a namespace or within different namespaces.
   * Values and keys can only be listed within a single namespace.
   */
  set(
    entity: z.infer<z.ZodObject<Attr>>,
    options?: EntitySetOptions
  ): Promise<{ version: number }>;
  /**
   * Deletes a single entry within an entity and namespace.
   */
  delete(
    key: EntityKey<Attr, P, S>,
    options?: EntityConsistencyOptions
  ): Promise<void>;
  /**
   * List entries that match a prefix within an entity and namespace.
   *
   * If namespace is not provided, only values which do not use composite keys will be returned.
   */
  query(
    key: EntityQueryKey<Attr, P, S>,
    request?: EntityQueryOptions
  ): Promise<EntityQueryResult<Attr>>;
  stream(
    name: string,
    options: EntityStreamOptions<Attr, P, S>,
    handler: EntityStreamHandler<Attr, P, S>
  ): EntityStream<Attr, P, S>;
  stream(
    name: string,
    handler: EntityStreamHandler<Attr, P, S>
  ): EntityStream<Attr, P, S>;
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
  P extends EntityCompositeKeyPart<Attr>,
  S extends EntityCompositeKeyPart<Attr> | undefined
> {
  attributes: Attr | z.ZodObject<Attr>;
  partition: P;
  sort?: S;
}

export function entity<
  Attr extends EntityAttributes,
  const P extends EntityCompositeKeyPart<Attr>,
  const S extends EntityCompositeKeyPart<Attr> | undefined
>(name: string, options: EntityOptions<Attr, P, S>): Entity<Attr, P, S> {
  if (entities().has(name)) {
    throw new Error(`entity with name '${name}' already exists`);
  }

  /**
   * Used to maintain a limited number of streams on the entity.
   */
  const streams: EntityStream<Attr, P, S>[] = [];

  const entity: Entity<Attr, P, S> = {
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
          return getEntityHook().get(name, ...args) as Promise<
            z.infer<z.ZodObject<Attr>>
          >;
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
        | [name: string, handler: EntityStreamHandler<Attr, P, S>]
        | [
            name: string,
            options: EntityStreamOptions<Attr, P, S>,
            handler: EntityStreamHandler<Attr, P, S>
          ]
        | [
            sourceLocation: SourceLocation,
            name: string,
            handler: EntityStreamHandler<Attr, P, S>
          ]
        | [
            sourceLocation: SourceLocation,
            name: string,
            options: EntityStreamOptions<Attr, P, S>,
            handler: EntityStreamHandler<Attr, P, S>
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
              args[1] as EntityStreamOptions<Attr, P, S>,
              args[2],
            ];

      if (streams.length > 1) {
        throw new Error("Only two streams are allowed per entity.");
      }

      const entityStream: EntityStream<Attr, P, S> = {
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
  const P extends EntityCompositeKeyPart<Attr>,
  const S extends EntityCompositeKeyPart<Attr> | undefined
>(
  ...args:
    | [
        name: string,
        entity: Entity<Attr, P, S>,
        handler: EntityStreamHandler<Attr, P, S>
      ]
    | [
        name: string,
        entity: Entity<Attr, P, S>,
        options: EntityStreamOptions<Attr, P, S>,
        handler: EntityStreamHandler<Attr, P, S>
      ]
    | [
        sourceLocation: SourceLocation,
        name: string,
        entity: Entity<Attr, P, S>,
        handler: EntityStreamHandler<Attr, P, S>
      ]
    | [
        sourceLocation: SourceLocation,
        name: string,
        entity: Entity<Attr, P, S>,
        options: EntityStreamOptions<Attr, P, S>,
        handler: EntityStreamHandler<Attr, P, S>
      ]
) {
  const [sourceLocation, name, entity, options, handler] =
    args.length === 3
      ? [, args[0], args[1], , args[2]]
      : args.length === 5
      ? args
      : isSourceLocation(args[0])
      ? [args[0], args[1] as string, args[2] as Entity<Attr, P, S>, , args[3]]
      : [
          ,
          args[0] as string,
          args[1] as Entity<Attr, P, S>,
          args[2] as EntityStreamOptions<Attr, P, S>,
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
