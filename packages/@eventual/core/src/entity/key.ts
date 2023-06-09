import type { Attributes } from "./entity.js";
import type t from "type-fest";

export type KeyValue = string | number | bigint;

/**
 * Composite Key - Whole key used to get and set an entity, made up of partition and sort key parts containing one or more attribute.
 * Key Part - partition or sort key of the composite key, each made up of one or more key attribute.
 * Key Attribute - A single attribute used as a segment of a key part.
 */

/**
 * Any attribute name considered to be a valid key attribute.
 */
export type KeyAttribute<Attr extends Attributes, Values = KeyValue> = {
  [K in keyof Attr]: K extends string
    ? // only include attributes that extend string or number
      Attr[K] extends Values
      ? K
      : never
    : never;
}[keyof Attr];

/**
 * An at least one tuple of attribute keys. Attributes can refer to any {@link KeyValue}.
 *
 * Used to define a key in an Entity, where all key attributes must not be optional.
 */
export type EntityCompositeKeyPart<Attr extends Attributes> = readonly [
  KeyAttribute<Attr, KeyValue>,
  ...KeyAttribute<Attr, KeyValue>[]
];

/**
 * An at least one tuple of attribute keys. Attributes can refer to any {@link KeyValue} and may be optional.
 *
 * Used to define a key in an {@link EntityIndex}, where key attributes may refer to optional fields. This is called a sparse index.
 */
export type IndexCompositeKeyPart<Attr extends Attributes> =
  | readonly [
      KeyAttribute<Attr, KeyValue | undefined>,
      ...KeyAttribute<Attr, KeyValue | undefined>[]
    ]
  | EntityCompositeKeyPart<Attr>;

/**
 * An at least one tuple of attribute keys. Does not include attribute type constraints, but the keys must be string.
 *
 * Should match either {@link IndexCompositeKeyPart} or {@link EntityCompositeKeyPart}.
 */
export type CompositeKeyPart<Attr extends Attributes> = readonly [
  KeyAttribute<Attr, any>,
  ...KeyAttribute<Attr, any>[]
];

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
  Attr extends Attributes = any,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> = {
  [k in Partition[number]]: Exclude<Attr[k], undefined>;
} & (Sort extends CompositeKeyPart<Attr>
  ? {
      [k in Sort[number]]: Exclude<Attr[k], undefined>;
    }
  : // eslint-disable-next-line
    {});

export type KeyPartialTuple<
  Attr extends Attributes,
  Attrs extends readonly (keyof Attr)[]
> = Attrs extends []
  ? readonly []
  : Attrs extends readonly [
      infer Head extends keyof Attr,
      ...infer Rest extends readonly (keyof Attr)[]
    ]
  ? readonly [Extract<Attr[Head], KeyValue>, ...KeyPartialTuple<Attr, Rest>]
  : readonly [];

/**
 * All attributes of the composite key as a in order tuple.
 *
 * ```ts
 * [partitionAttribute1, partitionAttribute2, sortAttribute1, sortAttribute2]
 * ```
 */
export type KeyTuple<
  Attr extends Attributes = Attributes,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
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
  Attr extends Attributes = Attributes,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> = KeyMap<Attr, Partition, Sort> | KeyTuple<Attr, Partition, Sort>;

/**
 * Matches if the key attribute is between the start and end value, inclusive.
 *
 * start <= value <= end
 *
 * Note: numeric multi-attribute key parts are treated as strings.
 */
export type QueryKeyCondition<Value extends KeyValue = KeyValue> =
  | BetweenQueryKeyCondition<Value>
  | LessThanQueryKeyCondition<Value>
  | LessThanEqualsQueryKeyCondition<Value>
  | GreaterThanQueryKeyCondition<Value>
  | GreaterThanEqualsQueryKeyCondition<Value>
  | BeginsWithQueryKeyCondition<Value>;

/**
 * Matches if the key attribute is between the start and end value, inclusive.
 *
 * start <= value <= end
 *
 * Note: numeric multi-attribute key parts are treated as strings.
 */
export interface BetweenQueryKeyCondition<Value extends KeyValue = KeyValue> {
  $between: [t.LiteralToPrimitive<Value>, t.LiteralToPrimitive<Value>];
}

/**
 * Matches if the key attribute starts with the given value.
 *
 * Can only be used with string fields.
 *
 * Note: numeric multi-attribute key parts are treated as strings.
 */
export interface BeginsWithQueryKeyCondition<
  Value extends KeyValue = KeyValue
> {
  $beginsWith: Extract<t.LiteralToPrimitive<Value>, string>;
}

/**
 * Matches if the key attribute is less than the given value.
 *
 * Note: numeric multi-attribute key parts are treated as strings.
 */
export interface LessThanQueryKeyCondition<Value extends KeyValue = KeyValue> {
  $lt: t.LiteralToPrimitive<Value>;
}

/**
 * Matches if the key attribute is less than or equal to the given value.
 *
 * Note: numeric multi-attribute key parts are treated as strings.
 */
export interface LessThanEqualsQueryKeyCondition<
  Value extends KeyValue = KeyValue
> {
  $lte: t.LiteralToPrimitive<Value>;
}

/**
 * Matches if the key attribute is greater than the given value.
 *
 * Note: numeric multi-attribute key parts are treated as strings.
 */
export interface GreaterThanQueryKeyCondition<
  Value extends KeyValue = KeyValue
> {
  $gt: t.LiteralToPrimitive<Value>;
}

/**
 * Matches if the key attribute is greater than or equal to the given value.
 *
 * Note: numeric multi-attribute key parts are treated as strings.
 */
export interface GreaterThanEqualsQueryKeyCondition<
  Value extends KeyValue = KeyValue
> {
  $gte: t.LiteralToPrimitive<Value>;
}

export type ProgressiveTupleQueryKey<
  Attr extends Attributes,
  Sort extends readonly (keyof Attr)[],
  Accum extends [] = []
> = Sort extends readonly []
  ? Accum
  : Sort extends readonly [
      infer k extends keyof Attr,
      ...infer ks extends readonly (keyof Attr)[]
    ]
  ?
      | Accum
      | [...Accum, QueryKeyCondition<Extract<Attr[k], KeyValue>>]
      | ProgressiveQueryKey<Attr, ks, [...Accum, Extract<Attr[k], KeyValue>]>
  : never;

export type ProgressiveQueryKey<
  Attr extends Attributes,
  Sort extends readonly (keyof Attr)[],
  Accum extends object = object
> = Sort extends readonly []
  ? Accum
  : Sort extends readonly [
      infer k extends keyof Attr,
      ...infer ks extends readonly (keyof Attr)[]
    ]
  ?
      | Accum
      | (Accum & {
          [sk in k]: QueryKeyCondition<Extract<Attr[sk], KeyValue>>;
        })
      | ProgressiveQueryKey<
          Attr,
          ks,
          Accum & {
            [sk in k]: Extract<Attr[sk], KeyValue>;
          }
        >
  : never;

export type QueryKeyMap<
  Attr extends Attributes = Attributes,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> = {
  [pk in Partition[number]]: Extract<Attr[pk], KeyValue>;
} & (Sort extends undefined
  ? // eslint-disable-next-line
    {}
  : ProgressiveQueryKey<Attr, Exclude<Sort, undefined>>);

/**
 * A partial key that can be used to query an entity.
 *
 * ```ts
 * entity.query({ part1: "val", part2: "val2", sort1: "val" });
 * ```
 */
export type QueryKey<
  Attr extends Attributes = Attributes,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> =
  | QueryKeyMap<Attr, Partition, Sort>
  | [
      ...KeyTuple<Attr, Partition>,
      ...(Sort extends undefined
        ? []
        : ProgressiveTupleQueryKey<Attr, Exclude<Sort, undefined>>)
    ];

/**
 * A stream query can contain partial sort keys and partial partition keys.
 */
export type StreamQueryKey<
  Attr extends Attributes = Attributes,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> = ProgressiveQueryKey<Attr, Partition> &
  (Sort extends undefined
    ? // eslint-disable-next-line
      {}
    : ProgressiveQueryKey<Attr, Exclude<Sort, undefined>>);

export type KeyAttributes<
  Attr extends Attributes = any,
  Partition extends IndexCompositeKeyPart<Attr> = IndexCompositeKeyPart<Attr>,
  Sort extends IndexCompositeKeyPart<Attr> | undefined =
    | IndexCompositeKeyPart<Attr>
    | undefined
> = Sort extends undefined
  ? Partition[number]
  : [...Partition, ...Exclude<Sort, undefined>][number];
