import { CompositeKey } from "@eventual/core";
import { normalizeCompositeKey } from "./stores/dictionary-store.js";

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
  lazy: LazyValue<T>
): T {
  return typeof lazy !== "function" ? lazy : lazy();
}

export function serializeCompositeKey(
  dictionaryName: string,
  _key: string | CompositeKey
) {
  const { key, namespace } = normalizeCompositeKey(_key);
  return `${dictionaryName}|${namespace ?? ""}|${key}`;
}

export function deserializeCompositeKey(
  sKey: string
): [string, string | CompositeKey] {
  const [name, namespace, key] = sKey.split("|") as [string, string, string];
  return [name, namespace ? { key, namespace } : key];
}
