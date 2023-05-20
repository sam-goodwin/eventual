import {
  EntityStreamOptions,
  EntityStreamSpec,
  SourceLocation,
  isSourceLocation,
} from "../internal/service-spec.js";
import type { ServiceContext } from "../service.js";
import type { Entity, Attributes } from "./entity.js";
import type { CompositeKeyPart, KeyMap } from "./key.js";

export interface EntityStreamContext {
  /**
   * Information about the containing service.
   */
  service: ServiceContext;
}

export interface EntityStreamHandler<
  Attr extends Attributes = Attributes,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
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
  Attr extends Attributes = Attributes,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> {
  streamName: string;
  entityName: string;
  key: KeyMap<Attr, Partition, Sort>;
}

export type EntityStreamItem<
  Attr extends Attributes = Attributes,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> =
  | EntityStreamInsertItem<Attr, Partition, Sort>
  | EntityStreamModifyItem<Attr, Partition, Sort>
  | EntityStreamRemoveItem<Attr, Partition, Sort>;

export interface EntityStreamInsertItem<
  Attr extends Attributes = Attributes,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> extends EntityStreamItemBase<Attr, Partition, Sort> {
  newValue: Attr;
  newVersion: number;
  operation: "insert";
}

export interface EntityStreamModifyItem<
  Attr extends Attributes = Attributes,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> extends EntityStreamItemBase<Attr, Partition, Sort> {
  operation: "modify";
  newValue: Attr;
  newVersion: number;
  oldValue?: Attr;
  oldVersion?: number;
}

export interface EntityStreamRemoveItem<
  Attr extends Attributes = Attributes,
  Partition extends CompositeKeyPart<Attr> = CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined =
    | CompositeKeyPart<Attr>
    | undefined
> extends EntityStreamItemBase<Attr, Partition, Sort> {
  operation: "remove";
  oldValue?: Attr;
  oldVersion?: number;
}

export interface EntityStream<
  Name extends string,
  Attr extends Attributes,
  Partition extends CompositeKeyPart<Attr>,
  Sort extends CompositeKeyPart<Attr> | undefined
> extends EntityStreamSpec<Name, Attr, Partition, Sort> {
  kind: "EntityStream";
  handler: EntityStreamHandler<Attr, Partition, Sort>;
  sourceLocation?: SourceLocation;
}

export function entityStream<
  Attr extends Attributes,
  const Partition extends CompositeKeyPart<Attr>,
  const Sort extends CompositeKeyPart<Attr> | undefined
>(
  ...args:
    | [
        name: string,
        entity: Entity<any, Attr, Partition, Sort>,
        handler: EntityStreamHandler<Attr, Partition, Sort>
      ]
    | [
        name: string,
        entity: Entity<any, Attr, Partition, Sort>,
        options: EntityStreamOptions<Attr, Partition, Sort>,
        handler: EntityStreamHandler<Attr, Partition, Sort>
      ]
    | [
        sourceLocation: SourceLocation,
        name: string,
        entity: Entity<any, Attr, Partition, Sort>,
        handler: EntityStreamHandler<Attr, Partition, Sort>
      ]
    | [
        sourceLocation: SourceLocation,
        name: string,
        entity: Entity<any, Attr, Partition, Sort>,
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
          args[2] as Entity<any, Attr, Partition, Sort>,
          ,
          args[3],
        ]
      : [
          ,
          args[0] as string,
          args[1] as Entity<any, Attr, Partition, Sort>,
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
