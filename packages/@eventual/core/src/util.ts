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

export interface Iterator<I, T extends I> {
  hasNext(): boolean;
  next(): T | undefined;
  drain(): T[];
  size(): number;
}

export function iterator<I, T extends I>(
  elms: I[],
  predicate?: (elm: I) => elm is T
): Iterator<I, T> {
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
