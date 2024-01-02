export type FunctionInput<H extends (...args: any[]) => any> =
  Parameters<H> extends [infer Input, ...any[]]
    ? Input
    : Parameters<H> extends []
    ? undefined
    : Parameters<H> extends [any?, ...any[]]
    ? Parameters<H>[0]
    : Parameters<H> extends [undefined?, ...any[]]
    ? undefined
    : never;
