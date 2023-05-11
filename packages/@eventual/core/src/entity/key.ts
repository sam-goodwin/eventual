import type { Entity, EntityAttributes } from "./entity.js";

export type EntityKeyValue = string | number;

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
    ? // only include attributes that extend string or number
      Attr[K] extends EntityKeyValue
      ? K
      : never
    : never;
}[keyof Attr];

/**
 * Extracts an {@link EntityKeyMap} from an {@link Entity} type.
 */
export type EntityCompositeKeyMapFromEntity<E extends Entity = Entity> =
  E extends Entity<infer Attributes, infer Partition, infer Sort>
    ? EntityKeyMap<Attributes, Partition, Sort>
    : never;

/**
 * Extracts an {@link EntityCompositeKey} from an {@link Entity} type.
 */
export type EntityKeyFromEntity<E extends Entity = Entity> = E extends Entity<
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
  Attrs extends readonly (keyof Attr)[]
> = Attrs extends readonly [
  infer Head extends keyof Attr,
  ...infer Rest extends readonly (keyof Attr)[]
]
  ? readonly [Attr[Head], ...EntityKeyPartialTuple<Attr, Rest>]
  : Attrs extends readonly [infer Head extends keyof Attr]
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
  Attr extends EntityAttributes = EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> = EntityKeyMap<Attr, Partition, Sort> | EntityKeyTuple<Attr, Partition, Sort>;

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
  Attr extends EntityAttributes = EntityAttributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> = Partial<EntityCompositeKey<Attr, Partition, Sort>>;
