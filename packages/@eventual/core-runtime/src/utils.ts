import {
  AnyEntity,
  BucketNotificationEvent,
  EntityKeyTuple,
  EntityStreamItem,
} from "@eventual/core";
import {
  BucketNotificationHandlerSpec,
  EntityStreamSpec,
} from "@eventual/core/internal";
import {
  normalizeCompositeKey,
  NormalizeEntityKey,
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
  key: NormalizeEntityKey
) {
  return `${entityName}|${key.partition.value}|${key.sort?.value ?? ""}`;
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

export function entityStreamMatchesItem<E extends AnyEntity = AnyEntity>(
  entity: E,
  item: EntityStreamItem<E>,
  streamSpec: EntityStreamSpec
) {
  const { partition } = normalizeCompositeKey(entity, item);
  return (
    streamSpec.entityName === item.entityName &&
    (!streamSpec.options?.operations ||
      streamSpec.options.operations.includes(item.operation)) &&
    (!streamSpec.options?.partitions ||
      (typeof partition.value === "string" &&
        streamSpec.options.partitions.includes(partition.value))) &&
    (!streamSpec.options?.partitionPrefixes ||
      streamSpec.options.partitionPrefixes.some(
        (p) =>
          typeof partition.value === "string" && partition.value.startsWith(p)
      ))
  );
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
