export function assertNever(never: never, msg?: string): never {
  throw new Error(msg ?? `reached unreachable code with value ${never}`);
}

export function not<T, U extends T>(
  f: (a: T) => a is U
): (a: T) => a is Exclude<T, U> {
  return ((a: any) => !f(a)) as any;
}

export function or<F extends ((a: any) => a is any)[]>(
  ...conditions: F
): (a: any) => a is F extends (a: any) => a is infer T ? T : never {
  return ((a: any) => conditions.some((cond) => cond(a))) as any;
}
