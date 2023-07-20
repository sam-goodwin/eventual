/* eslint-disable @typescript-eslint/ban-types */

import { z } from "zod";
import type { AttributesSchema } from "./entity.js";
import type t from "type-fest";
import { Simplify } from "../type-utils.js";

export type KeyValue = string | number | bigint;

export type KeySchema = z.ZodType<KeyValue> | z.ZodEffects<any, any, KeyValue>;

/**
 * Composite Key - Whole key used to get and set an entity, made up of partition and sort key parts containing one or more attribute.
 * Key Part - partition or sort key of the composite key, each made up of one or more key attribute.
 * Key Attribute - A single attribute used as a segment of a key part.
 */

/**
 * Any attribute name considered to be a valid key attribute.
 */
export type KeyAttribute<Attr extends AttributesSchema, Value = KeyValue> = {
  [K in keyof Attr]: K extends string
    ? // only include attributes that extend string or number
      z.input<Attr[K]> extends Value
      ? K
      : never
    : never;
}[keyof Attr];

/**
 * An at least one tuple of attribute keys. Attributes can refer to any {@link KeyValue}.
 *
 * Used to define a key in an Entity, where all key attributes must not be optional.
 */
export type EntityCompositeKeyPart<Attr extends AttributesSchema> = readonly [
  KeyAttribute<Attr, KeyValue>,
  ...KeyAttribute<Attr, KeyValue>[]
];

/**
 * An at least one tuple of attribute keys. Attributes can refer to any {@link KeyValue} and may be optional.
 *
 * Used to define a key in an {@link EntityIndex}, where key attributes may refer to optional fields. This is called a sparse index.
 */
export type IndexCompositeKeyPart<Attr extends AttributesSchema> =
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
export type CompositeKeyPart<Attr extends AttributesSchema> = readonly [
  KeyAttribute<Attr, any>,
  ...(readonly KeyAttribute<Attr, any>[])
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
  Attr extends AttributesSchema = any,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> = {
  [k in Partition[number]]: Exclude<z.infer<Attr[k]>, undefined>;
} & (Sort extends CompositeKeyPart<Attr>
  ? {
      [k in Sort[number]]: Exclude<z.infer<Attr[k]>, undefined>;
    }
  : {});

export type KeyPartialTuple<
  Attr extends AttributesSchema,
  Attrs extends readonly (keyof Attr)[]
> = Attrs extends []
  ? readonly []
  : Attrs extends readonly [
      infer Head extends keyof Attr,
      ...infer Rest extends readonly (keyof Attr)[]
    ]
  ? readonly [
      Extract<z.infer<Attr[Head]>, KeyValue>,
      ...KeyPartialTuple<Attr, Rest>
    ]
  : readonly [];

/**
 * All attributes of the composite key as a in order tuple.
 *
 * ```ts
 * [partitionAttribute1, partitionAttribute2, sortAttribute1, sortAttribute2]
 * ```
 */
export type KeyTuple<
  Attr extends AttributesSchema = AttributesSchema,
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
  Attr extends AttributesSchema = AttributesSchema,
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
export type QueryKeyCondition<K extends KeySchema = KeySchema> = Simplify<
  | BetweenQueryKeyCondition<K>
  | LessThanQueryKeyCondition<K>
  | LessThanEqualsQueryKeyCondition<K>
  | GreaterThanQueryKeyCondition<K>
  | GreaterThanEqualsQueryKeyCondition<K>
  | BeginsWithQueryKeyCondition<K>
>;

/**
 * Matches if the key attribute is between the start and end value, inclusive.
 *
 * start <= value <= end
 *
 * Note: numeric multi-attribute key parts are treated as strings.
 */
export interface BetweenQueryKeyCondition<K extends KeySchema = KeySchema> {
  $between: [
    z.infer<K> | t.LiteralToPrimitive<z.input<K>>,
    z.infer<K> | t.LiteralToPrimitive<z.input<K>>
  ];
}

/**
 * Matches if the key attribute starts with the given value.
 *
 * Can only be used with string fields.
 *
 * Note: numeric multi-attribute key parts are treated as strings.
 */
export interface BeginsWithQueryKeyCondition<K extends KeySchema = KeySchema> {
  $beginsWith: z.infer<K> | t.LiteralToPrimitive<z.input<K>>;
}

/**
 * Matches if the key attribute is less than the given value.
 *
 * Note: numeric multi-attribute key parts are treated as strings.
 */
export interface LessThanQueryKeyCondition<K extends KeySchema = KeySchema> {
  $lt: z.infer<K> | t.LiteralToPrimitive<z.input<K>>;
}

/**
 * Matches if the key attribute is less than or equal to the given value.
 *
 * Note: numeric multi-attribute key parts are treated as strings.
 */
export interface LessThanEqualsQueryKeyCondition<
  K extends KeySchema = KeySchema
> {
  $lte: z.infer<K> | t.LiteralToPrimitive<z.input<K>>;
}

/**
 * Matches if the key attribute is greater than the given value.
 *
 * Note: numeric multi-attribute key parts are treated as strings.
 */
export interface GreaterThanQueryKeyCondition<K extends KeySchema = KeySchema> {
  $gt: z.infer<K> | t.LiteralToPrimitive<z.input<K>>;
}

/**
 * Matches if the key attribute is greater than or equal to the given value.
 *
 * Note: numeric multi-attribute key parts are treated as strings.
 */
export interface GreaterThanEqualsQueryKeyCondition<
  K extends KeySchema = KeySchema
> {
  $gte: z.infer<K> | t.LiteralToPrimitive<z.input<K>>;
}

export type ProgressiveTupleQueryKey<
  Attr extends AttributesSchema,
  Sort extends readonly (keyof Attr)[],
  Accum extends any[] = []
> = Sort extends readonly []
  ? Accum
  : Sort extends readonly [
      infer k extends keyof Attr,
      ...infer ks extends readonly (keyof Attr)[]
    ]
  ?
      | Accum
      | [...Accum, QueryKeyCondition<Extract<Attr[k], KeySchema>>]
      | ProgressiveTupleQueryKey<Attr, ks, [...Accum, z.infer<Attr[k]>]>
  : never;

export type ProgressiveQueryKey<
  Attr extends AttributesSchema,
  Sort extends readonly (keyof Attr)[]
> = Sort extends readonly [
  infer k extends keyof Attr,
  ...infer ks extends readonly (keyof Attr)[]
]
  ?
      | { [sk in Sort[number]]?: never }
      | {
          [sk in k]: QueryKeyCondition<Extract<Attr[k], KeySchema>>;
        }
      | BetweenProgressiveKeyCondition<Attr, Sort>
      | ({
          [sk in k]: z.infer<Attr[sk]>;
        } & ProgressiveQueryKey<Attr, ks>)
  : {};

/**
 * Supports betweens condition using multiple sort attribute parts.
 *
 * At least one attribute must be present in the left and right side.
 *
 * BETWEEN "a" and "c#b"
 * {
 *    $between: [{sort1: "a"}, {sort1: "c", sort2: "b"}]
 * }
 *
 * BETWEEN "a" and "c"
 * {
 *    sort1: { $between: ["a", "c"] }
 * }
 */
export type BetweenProgressiveKeyCondition<
  Attr extends AttributesSchema,
  Sort extends readonly (keyof Attr)[]
> = {
  $between: Sort extends readonly [
    infer k extends keyof Attr,
    ...infer ks extends readonly (keyof Attr)[]
  ]
    ? [
        ProgressiveKey<Attr, ks> & {
          [sk in k]: z.infer<Attr[sk]>;
        },
        ProgressiveKey<Attr, ks> & {
          [sk in k]: z.infer<Attr[sk]>;
        }
      ]
    : never;
};

export type ProgressiveKey<
  Attr extends AttributesSchema,
  Sort extends readonly (keyof Attr)[]
> = Sort extends readonly [
  infer k extends keyof Attr,
  ...infer ks extends readonly (keyof Attr)[]
]
  ?
      | { [sk in Sort[number]]?: never }
      | ({
          [sk in k]: z.infer<Attr[sk]>;
        } & ProgressiveKey<Attr, ks>)
  : {};

export type QueryKeyMap<
  Attr extends AttributesSchema = AttributesSchema,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> = {
  [pk in Partition[number]]: z.infer<Attr[pk]>;
} & (Sort extends undefined
  ? {}
  : ProgressiveQueryKey<Attr, [...Exclude<Sort, undefined>]>);

/**
 * A partial key that can be used to query an entity.
 *
 * ```ts
 * entity.query({ part1: "val", part2: "val2", sort1: "val" });
 * ```
 */
export type QueryKey<
  Attr extends AttributesSchema,
  Partition extends CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined
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
  Attr extends AttributesSchema = AttributesSchema,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> = ProgressiveKey<Attr, Partition> &
  (Sort extends undefined
    ? // eslint-disable-next-line
      {}
    : ProgressiveKey<Attr, Exclude<Sort, undefined>>);

export type KeyAttributes<
  Attr extends AttributesSchema = any,
  Partition extends IndexCompositeKeyPart<Attr> = IndexCompositeKeyPart<Attr>,
  Sort extends IndexCompositeKeyPart<Attr> | undefined =
    | IndexCompositeKeyPart<Attr>
    | undefined
> = Sort extends undefined
  ? Partition[number]
  : [...Partition, ...Exclude<Sort, undefined>][number];
