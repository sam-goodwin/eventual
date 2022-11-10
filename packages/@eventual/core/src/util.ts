export function assertNever(never: never, msg?: string): never {
  throw new Error(msg ?? `reached unreachable code with value ${never}`);
}

export function not<T, U extends T>(
  f: (a: T) => a is U
): (a: T) => a is Exclude<T, U> {
  return ((a: any) => !f(a)) as any;
}
