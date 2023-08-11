export function assertNever(never: never, msg?: string): never {
  throw new Error(
    msg ?? `reached unreachable code with value ${JSON.stringify(never)}`
  );
}

export function assertNonNull<T>(value?: T, msg?: string): NonNullable<T> {
  if (!value) {
    throw new Error(msg ?? "expected value to be defined and not null.");
  }
  return value!;
}

export function or<F extends ((a: any) => a is any)[]>(
  ...conditions: F
): (a: any) => a is F[number] extends (a: any) => a is infer T ? T : never {
  return ((a: any) => conditions.some((cond) => cond(a))) as any;
}

// API Gateway doesn't agree with uri encoding in path parameter... so we have these. for now
export function encodeExecutionId(executionId: string) {
  return Buffer.from(executionId, "utf-8").toString("base64");
}
