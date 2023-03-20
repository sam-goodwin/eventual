import { z } from "zod";

export type Attributes = {
  [attributeName in string]: z.ZodType;
};

export type EntityValue<Attr extends Attributes> = {
  [attributeName in keyof Attr]: z.infer<Attr[attributeName]>;
};

export interface Entity<
  Type extends string = string,
  Version extends string = string,
  Attr extends Attributes = Attributes,
  Key extends EntityIndex<Attr> = EntityIndex<Attr>,
  Indexes extends EntityIndexes<Attr> = EntityIndexes<Attr>
> {
  type: Type;
  key: Key;
  version: Version;
  attributes: Attr;
  indexes: Indexes;
  schema: z.ZodObject<
    Attr & {
      type: z.ZodLiteral<Type>;
    }
  >;
}

export type EntityKeyAttr<Attr extends Attributes> = Attributes extends Attr
  ? keyof Attr
  : {
      [k in keyof Attr]: Attr[k] extends z.ZodString | z.ZodNumber | z.ZodDate
        ? k
        : never;
    }[keyof Attr];

export interface EntityIndex<
  Attr extends Attributes,
  Partition extends EntityKeyAttr<Attr>[] = EntityKeyAttr<Attr>[],
  Range extends EntityKeyAttr<Attr>[] | undefined =
    | EntityKeyAttr<Attr>[]
    | undefined
> {
  partition: Partition;
  range?: Range;
}

export type EntityIndexes<Attr extends Attributes> = {
  [indexName: string]: EntityIndex<Attr>;
};

export const EntitySymbol = Symbol.for("eventual:Entity");

export interface EntityProps<
  Key extends EntityIndex<Attr>,
  Attr extends Attributes = Attributes,
  Version extends string = string,
  Indexes extends EntityIndexes<Attr> | undefined = undefined
> {
  key: Key;
  attributes: Attr;
  version: Version;
  indexes?: Indexes;
}

export function entity<
  Type extends string,
  Key extends EntityIndex<Attr>,
  Attr extends Attributes,
  Version extends string,
  Indexes extends EntityIndexes<Attr>
>(
  type: Type,
  props: EntityProps<Key, Attr, Version, Indexes>
): Entity<Type, Version, Attr, Key, Indexes> {
  if ("type" in props.attributes) {
    throw new Error(`cannot use reserved attribute name, 'type'`);
  }
  return {
    ...props,
    type,
    schema: z.object({
      ...props.attributes,
      type: z.literal(type),
    }) as any,
    indexes: props.indexes!,
  };
}
