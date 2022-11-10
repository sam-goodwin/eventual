export function assertNever(never: never, msg?: string): never {
  throw new Error(msg ?? `reached unreachable code with value ${never}`);
}
