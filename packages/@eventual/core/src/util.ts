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

export function extendsError(err: any): err is Error {
  return (
    err &&
    (err instanceof Error ||
      ("prototype" in err &&
        err.prototype &&
        err.prototype.isPrototypeOf(Error)))
  );
}
