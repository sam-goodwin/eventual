export function assertNever(never: never, msg?: string): never {
  throw new Error(msg ?? `reached unreachable code with value ${never}`);
}

export function assertNonNull<T>(value?: T, msg?: string): NonNullable<T> {
  if (!value) {
    throw new Error(msg ?? "expected value to be defined and not null.");
  }
  return value!;
}

export function not<T, U extends T>(
  f: (a: T) => a is U
): (a: T) => a is Exclude<T, U> {
  return ((a: any) => !f(a)) as any;
}

export function or<F extends ((a: any) => a is any)[]>(
  ...conditions: F
): (a: any) => a is F[number] extends (a: any) => a is infer T ? T : never {
  return ((a: any) => conditions.some((cond) => cond(a))) as any;
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

export interface _Iterator<I, T extends I> {
  hasNext(): boolean;
  next(): T | undefined;
  drain(): T[];
  size(): number;
}

export function iterator<I, T extends I>(
  elms: I[],
  predicate?: (elm: I) => elm is T
): _Iterator<I, T> {
  let cursor = 0;
  return {
    hasNext: () => {
      seek();
      return cursor < elms.length;
    },
    next: (): T => {
      seek();
      return elms[cursor++] as T;
    },
    drain: (): T[] => {
      const events = predicate
        ? elms.slice(cursor).filter(predicate)
        : (elms.slice(cursor) as T[]);
      cursor = elms.length;
      return events;
    },
    size: (): number => {
      return predicate
        ? elms.filter(predicate).length - cursor
        : elms.length - cursor;
    },
  };

  function seek() {
    if (predicate) {
      while (cursor < elms.length) {
        if (predicate(elms[cursor]!)) {
          return;
        }
        cursor++;
      }
    }
  }
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

/**
 * Evaluates a computed type, T, and returns the final
 * type signature as an object literal.
 */
export type Eval<T> = UnionToIntersection<T>;

export type UnionToIntersection<T> = (
  T extends any ? (x: T) => any : never
) extends (x: infer R) => any
  ? R
  : never;
