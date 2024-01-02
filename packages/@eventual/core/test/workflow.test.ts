import { FunctionInput } from "../src/function-input.js";
type A = FunctionInput<(args: any, context: any) => Promise<string>>;

type B = FunctionInput<() => Promise<string>>;

type C = FunctionInput<(input?: undefined, context?: any) => Promise<string>>;
type D = FunctionInput<(input?: string, context?: any) => Promise<string>>;
type E = FunctionInput<(input: string, context: any) => Promise<string>>;
type F = FunctionInput<(input: undefined, context: any) => Promise<string>>;
type G = FunctionInput<(thr?: any) => Promise<string>>;

declare const a: A;
declare const b: B;
declare const c: C;
declare const d: D;
declare const e: E;
declare const f: F;
declare const g: G;

type IsAny<T> = 0 extends 1 & T ? true : false;

// eslint-disable-next-line no-unused-expressions
() => {
  isAny(a, true);
  // @ts-expect-error
  isAny(a, false);

  is<undefined>(b);

  is<undefined>(c);

  is<string | undefined>(d);
  // @ts-expect-error
  is<string>(d);

  is<string>(e);
  assertNever(is<string | undefined>(e));

  is<undefined>(f);

  isAny(g, true);
};

declare function isAny<T>(value: T, isAny: IsAny<T>): any;

declare function is<T>(
  value: T
): IsExact<T, typeof value> extends true ? void : never;

type IsExact<T, U> = T extends U ? (U extends T ? true : false) : false;

declare function assertNever(_value: never);
