import {
  Attributes,
  BucketNotificationEvent,
  Entity,
  EntityCompositeKeyPart,
  EntityStreamItem,
  KeyTuple,
  SystemError,
} from "@eventual/core";
import type {
  BucketNotificationHandlerSpec,
  EntityStreamSpec,
} from "@eventual/core/internal";
import type { Readable } from "stream";
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

/**
 * Groups the items based on the group function and then executes the groups in parallel, but the items within a group in order.
 *
 * When one item in a group failed, fail the rest of the group which have yet to succeed.
 */
export async function groupedPromiseAllSettled<I, R>(
  items: I[],
  group: (item: I) => string,
  handler: (item: I) => Promise<R> | R
): Promise<
  Record<
    string,
    {
      fulfilled: (readonly [I, Awaited<R>])[];
      rejected: (readonly [I, any])[];
    }
  >
> {
  const itemsByKey: Record<string, I[]> = {};
  items.forEach((item) => {
    const key = group(item);
    (itemsByKey[key] ??= []).push(item);
  });

  const results = await promiseAllSettledPartitioned(
    Object.entries(itemsByKey),
    async ([, itemGroup]) => {
      const fulfilled: [I, Awaited<R>][] = [];
      for (const i in itemGroup) {
        const item = itemGroup[i]!;
        try {
          const result = await handler(item);
          // if the handler doesn't fail and doesn't return false, continue
          fulfilled.push([item, result]);
          continue;
        } catch (err) {
          return {
            fulfilled,
            rejected: [
              [item, err] as const,
              ...itemGroup
                .slice(Number(i) + 1)
                .map((i) => [i, "cascading failure"] as const),
            ],
          };
        }
      }
      return {
        fulfilled,
        rejected: [] as [I, any][],
      };
    }
  );

  return Object.fromEntries(
    results.fulfilled.map(([[group], r]) => [group, r])
  );
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

export function deserializeCompositeKey(sKey: string): [string, KeyTuple] {
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
  Attr extends Attributes,
  const Partition extends EntityCompositeKeyPart<Attr>,
  const Sort extends EntityCompositeKeyPart<Attr> | undefined
>(
  entity: Entity<any, Attr, Partition, Sort>,
  item: EntityStreamItem<Attr, Partition, Sort>,
  streamSpec: EntityStreamSpec<any, Attr, Partition, Sort>
) {
  const { partition, sort } = normalizeCompositeKey(entity, item.key);
  const normalizedQueryKeys =
    streamSpec.options?.queryKeys?.map((key) =>
      normalizeCompositeKey(entity, key)
    ) ?? [];

  return (
    streamSpec.entityName === entity.name &&
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

export async function streamToBuffer(stream: Readable) {
  // lets have a ReadableStream as a stream variable
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/**
 * Returns a hash code from a string
 * @param  {String} str The string to hash.
 * @return {Number}    A 32bit integer
 * @see http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
 * @see https://stackoverflow.com/a/8831937/968011
 */
export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

export function extendsError(err: unknown): err is Error {
  return (
    !!err &&
    typeof err === "object" &&
    (err instanceof Error ||
      ("prototype" in err &&
        !!err.prototype &&
        Object.prototype.isPrototypeOf.call(err.prototype, Error)))
  );
}

export function extendsSystemError(err: unknown): err is SystemError {
  return (
    !!err &&
    typeof err === "object" &&
    (err instanceof SystemError ||
      ("prototype" in err &&
        !!err.prototype &&
        Object.prototype.isPrototypeOf.call(err.prototype, SystemError)))
  );
}

export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;

  // Ensure both are objects and are not null
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  ) {
    return false;
  }

  if (Array.isArray(a) === Array.isArray(b)) {
    if (Array.isArray(a)) {
      if (a.length !== b.length) {
        return false;
      }
      return a.every((v, i) => deepEqual(v, b[i]));
    }
  } else {
    return false;
  }

  const keysA = Object.entries(a)
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name);
  const keysB = Object.entries(b)
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name);

  // Ensure both objects have the same number of properties
  if (keysA.length !== keysB.length) return false;

  // Check if every key-value pair in 'a' matches that in 'b'
  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
      return false;
    }
  }

  return true;
}

export function withMiddlewares<Context, Output, Request>(
  middlewares: ((input: {
    next: (context: Context) => Promise<Output>;
    context: Context;
    request: Request;
  }) =>
    | Promise<Output & { context?: Context }>
    | (Output & { context?: Context }))[],
  handler: (request: Request, context: Context) => Promise<Output>
): (request: Request, context: Context) => Promise<Output> {
  return async (request: Request, context: Context): Promise<Output> => {
    const chain = middlewares.values();

    return next(request, context);

    async function next(request: Request, context: Context): Promise<Output> {
      let consumed = false;
      const middleware = chain.next();
      if (middleware.done) {
        return handler(request, context);
      } else {
        return middleware.value({
          request,
          context,
          next: async (context) => {
            if (consumed) {
              consumed = true;
              throw new Error(`Middleware cannot call 'next' more than once`);
            }
            return next(request, context);
          },
        });
      }
    }
  };
}
