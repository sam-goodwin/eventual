export type KeysOfType<T, U> = {
  [k in keyof T]: T[k] extends U ? k : never;
}[keyof T];
