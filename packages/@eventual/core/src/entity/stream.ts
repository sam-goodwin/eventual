import type {
  EntityStreamOperation,
  EntityStreamSpec,
  SourceLocation,
} from "../internal/service-spec.js";
import type { ServiceContext } from "../service.js";
import type { Attributes } from "./entity.js";
import type { EntityCompositeKeyPart, KeyMap } from "./key.js";

export interface EntityStreamStreamContext {
  streamName: string;
  entityName: string;
}

export interface EntityStreamContext {
  /**
   * Information about the stream.
   */
  stream: EntityStreamStreamContext;
  /**
   * Information about the containing service.
   */
  service: ServiceContext;
}

export interface EntityStreamHandler<
  Attr extends Attributes = Attributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined,
  Operations extends EntityStreamOperation[] = EntityStreamOperation[],
  IncludeOld extends boolean = false
> {
  /**
   * Provides the keys, new value
   */
  (
    item: EntityStreamItem<Attr, Partition, Sort, Operations, IncludeOld>,
    context: EntityStreamContext
  ): Promise<void | false> | void | false;
}

export interface EntityBatchStreamHandler<
  Attr extends Attributes = Attributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined,
  Operations extends EntityStreamOperation[] = EntityStreamOperation[]
> {
  /**
   * Provides the keys, new value
   */
  (
    items: EntityStreamItem<Attr, Partition, Sort, Operations>[],
    context: EntityStreamContext
  ):
    | Promise<void | { failedItemIds?: string[] }>
    | void
    | { failedItemIds?: string[] };
}

export interface EntityStreamItemBase<
  Attr extends Attributes = Attributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> {
  key: KeyMap<Attr, Partition, Sort>;
}

export type EntityStreamItem<
  Attr extends Attributes = Attributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined,
  Operations extends EntityStreamOperation[] = EntityStreamOperation[],
  IncludeOld extends boolean = false
> = (
  | EntityStreamInsertItem<Attr, Partition, Sort>
  | EntityStreamModifyItem<Attr, Partition, Sort, IncludeOld>
  | EntityStreamRemoveItem<Attr, Partition, Sort, IncludeOld>
) & { id: string; operation: Operations[number] };

export interface EntityStreamInsertItem<
  Attr extends Attributes = Attributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined
> extends EntityStreamItemBase<Attr, Partition, Sort> {
  newValue: Attr;
  newVersion: number;
  operation: "insert";
}

export interface EntityStreamModifyItem<
  Attr extends Attributes = Attributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined,
  IncludeOld extends boolean = false
> extends EntityStreamItemBase<Attr, Partition, Sort> {
  operation: "modify";
  newValue: Attr;
  newVersion: number;
  oldValue: IncludeOld extends true ? Attr : undefined;
  oldVersion: number;
}

export interface EntityStreamRemoveItem<
  Attr extends Attributes = Attributes,
  Partition extends EntityCompositeKeyPart<Attr> = EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined =
    | EntityCompositeKeyPart<Attr>
    | undefined,
  IncludeOld extends boolean = false
> extends EntityStreamItemBase<Attr, Partition, Sort> {
  operation: "remove";
  oldValue?: IncludeOld extends true ? Attr : undefined;
  oldVersion?: number;
}

export interface EntityStream<
  Name extends string,
  Attr extends Attributes,
  Partition extends EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined
> extends EntityStreamSpec<Name, Attr, Partition, Sort> {
  kind: "EntityStream";
  handler: EntityStreamHandler<Attr, Partition, Sort>;
  sourceLocation?: SourceLocation;
}

export interface EntityBatchStream<
  Name extends string,
  Attr extends Attributes,
  Partition extends EntityCompositeKeyPart<Attr>,
  Sort extends EntityCompositeKeyPart<Attr> | undefined
> extends EntityStreamSpec<Name, Attr, Partition, Sort> {
  kind: "EntityBatchStream";
  handler: EntityBatchStreamHandler<Attr, Partition, Sort>;
  sourceLocation?: SourceLocation;
}
