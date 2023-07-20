export type KeysOfType<T, U> = {
  [k in keyof T]: T[k] extends U ? k : never;
}[keyof T];

// force collapse of chained intersection, eg { a: string } & { b: string } => { a: string; b: string;}
export type Simplify<T> = {
  [KeyType in keyof T]: T[KeyType];
} & {};
