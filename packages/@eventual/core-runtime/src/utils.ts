import type {
  BucketNotificationEvent,
  Entity,
  EntityAttributes,
  EntityCompositeKeyPart,
  EntityKeyTuple,
  EntityStreamItem,
} from "@eventual/core";
import type {
  BucketNotificationHandlerSpec,
  EntityStreamSpec,
} from "@eventual/core/internal";
import {
  NormalizedEntityCompositeKey,
  NormalizedEntityKeyPart,
  normalizeCompositeKey,
} from "./stores/entity-store.js";

export async function promiseAllSettledPartitioned<T, R>(
  items: T[],
  op: (item: T) => Promise<R>
): Promise<{
  fulfilled: [T, Awaited<R>][];
  rejected: [T, string][];
}> {
  const results = await Promise.allSettled(items.map(op));

  const enumerated = results.map((r, i) => [r, i] as const);

  return {
    fulfilled: enumerated
      .filter(
        (t): t is [PromiseFulfilledResult<Awaited<R>>, number] =>
          t[0].status === "fulfilled"
      )
      .map(([r, i]) => [items[i]!, r.value] as [T, Awaited<R>]),
    rejected: enumerated
      .filter(
        (t): t is [PromiseRejectedResult, number] => t[0].status === "rejected"
      )
      .map(([r, i]) => [items[i]!, r.reason] as [T, string]),
  };
}

export function groupBy<T>(
  items: T[],
  extract: (item: T) => string
): Record<string, T[]> {
  return items.reduce((obj: Record<string, T[]>, r) => {
    const id = extract(r);
    return {
      ...obj,
      [id]: [...(obj[id] || []), r],
    };
  }, {});
}

export type LazyValue<T extends string | number | object | boolean> =
  | T
  | (() => T);

export function getLazy<T extends string | number | object | boolean>(
  lazy: LazyValue<T> | T
): T {
  return typeof lazy !== "function" ? lazy : lazy();
}

export function serializeCompositeKey(
  entityName: string,
  key: NormalizedEntityCompositeKey
) {
  return `${entityName}|${key.partition.keyValue}|${key.sort?.keyValue ?? ""}`;
}

export function deserializeCompositeKey(
  sKey: string
): [string, EntityKeyTuple<any, any, any>] {
  const [name, partition, sort] = sKey.split("|") as [string, string, string];
  return [name, sort ? [partition, sort] : [partition]];
}

export function isEntityStreamItem(value: any): value is EntityStreamItem<any> {
  return "entityName" in value && "operation" in value;
}

export function isBucketNotificationEvent(
  value: any
): value is BucketNotificationEvent {
  return "bucketName" in value && "event" in value;
}

export function entityStreamMatchesItem<
  Attr extends EntityAttributes,
  const Partition extends EntityCompositeKeyPart<Attr>,
  const Sort extends EntityCompositeKeyPart<Attr> | undefined
>(
  entity: Entity<Attr, Partition, Sort>,
  item: EntityStreamItem<Attr, Partition, Sort>,
  streamSpec: EntityStreamSpec<Attr, Partition, Sort>
) {
  const { partition, sort } = normalizeCompositeKey(entity, item.key);
  const normalizedQueryKeys =
    streamSpec.options?.queryKeys?.map((key) =>
      normalizeCompositeKey(entity, key)
    ) ?? [];
  return (
    streamSpec.entityName === item.entityName &&
    (!streamSpec.options?.operations ||
      streamSpec.options.operations.includes(item.operation)) &&
    (normalizedQueryKeys.length === 0 ||
      normalizedQueryKeys.some(
        (k) =>
          // if the query key exists, it will have at least a partial partition key
          compareNormalizedEntityKeyPart(partition, k.partition) &&
          // if there is a sort part to the query key, there must be a sort key to the value
          (!k.sort || (sort && compareNormalizedEntityKeyPart(sort, k.sort)))
      ))
  );
}

function compareNormalizedEntityKeyPart(
  value: NormalizedEntityKeyPart,
  matcher: NormalizedEntityKeyPart
) {
  return matcher.partialValue
    ? // the matcher is a partial value and both matcher and value are string
      typeof value.keyValue === "string" &&
        typeof matcher.keyValue === "string" &&
        value.keyValue.startsWith(matcher.keyValue)
    : // matcher is not partial, compare the two
      matcher.keyValue === value.keyValue;
}

export function bucketHandlerMatchesEvent(
  item: BucketNotificationEvent,
  streamSpec: BucketNotificationHandlerSpec
) {
  return (
    streamSpec.bucketName === item.bucketName &&
    (!streamSpec.options?.eventTypes ||
      streamSpec.options?.eventTypes.includes(item.event)) &&
    (!streamSpec.options?.filters ||
      streamSpec.options?.filters.some((f) => {
        return (
          (!f.prefix || item.key.startsWith(f.prefix)) &&
          (!f.suffix || item.key.endsWith(f.suffix))
        );
      }))
  );
}
