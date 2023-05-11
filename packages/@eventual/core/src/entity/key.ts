import type { EntityAttributes } from "./entity.js";

export type KeyValue = string | number;

/**
 * Composite Key - Whole key used to get and set an entity, made up of partition and sort key parts containing one or more attribute.
 * Key Part - partition or sort key of the composite key, each made up of one or more key attribute.
 * Key Attribute - A single attribute used as a segment of a key part.
 */

/**
 * Any attribute name considered to be a valid key attribute.
 */
export type KeyAttribute<Attr extends EntityAttributes> = {
  [K in keyof Attr]: K extends string
    ? // only include attributes that extend string or number
      Attr[K] extends KeyValue
      ? K
      : never
    : never;
}[keyof Attr];

/**
 * A part of the composite key, either the partition or sort key.
 */
export type CompositeKeyPart<Attr extends EntityAttributes> =
  readonly KeyAttribute<Attr>[];

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
export type KeyMap<
  Attr extends EntityAttributes = any,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> = {
  [k in Partition[number]]: Attr[k];
} & (Sort extends CompositeKeyPart<Attr>
  ? {
      [k in Sort[number]]: Attr[k];
    }
  : // eslint-disable-next-line
    {});

export type KeyPartialTuple<
  Attr extends EntityAttributes,
  Attrs extends readonly (keyof Attr)[]
> = Attrs extends []
  ? readonly []
  : Attrs extends readonly [
      infer Head extends keyof Attr,
      ...infer Rest extends readonly (keyof Attr)[]
    ]
  ? readonly [Attr[Head], ...KeyPartialTuple<Attr, Rest>]
  : readonly [];

/**
 * All attributes of the composite key as a in order tuple.
 *
 * ```ts
 * [partitionAttribute1, partitionAttribute2, sortAttribute1, sortAttribute2]
 * ```
 */
export type KeyTuple<
  Attr extends EntityAttributes,
  Partition extends CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined
> = Sort extends undefined
  ? KeyPartialTuple<Attr, Partition>
  : readonly [
      ...KeyPartialTuple<Attr, Partition>,
      ...KeyPartialTuple<Attr, Exclude<Sort, undefined>>
    ];

/**
 * All attributes in either the partition key and the sort key (when present).
 */
export type CompositeKey<
  Attr extends EntityAttributes = EntityAttributes,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> = KeyMap<Attr, Partition, Sort> | KeyTuple<Attr, Partition, Sort>;

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
export type QueryKey<
  Attr extends EntityAttributes = EntityAttributes,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> = Partial<CompositeKey<Attr, Partition, Sort>>;
