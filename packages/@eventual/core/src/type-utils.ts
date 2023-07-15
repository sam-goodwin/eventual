import fest from "type-fest";

export type KeysOfType<T, U> = {
  [k in keyof T]: T[k] extends U ? k : never;
}[keyof T];

// the .optional() properties do not maintain the ? optional modifier
// TODO: debug
export type SetOptionalFields<T> = fest.SetOptional<
  T,
  {
    [k in keyof T]: undefined extends T[k] ? k : never;
  }[keyof T]
>;
