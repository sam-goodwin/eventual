import { Bucket } from "../bucket.js";

declare global {
  var eventualBucketHook: BucketHook | undefined;
}

export interface BucketDefinition {
  name: string;
}

export type BucketMethods = Exclude<
  {
    [k in keyof Bucket]: Bucket[k] extends Function ? k : never;
  }[keyof Bucket],
  "on"
>;

export type BucketHook = {
  [K in BucketMethods]: (
    bucketName: string,
    ...args: Parameters<Bucket[K]>
  ) => ReturnType<Bucket[K]>;
} & {
  physicalName: (bucketName: string) => string;
};

export function getBucketHook() {
  const hook = globalThis.eventualBucketHook;
  if (!hook) {
    throw new Error("An bucket hook has not been registered.");
  }
  return hook;
}

export function registerBucketHook(bucketHook: BucketHook) {
  return (globalThis.eventualBucketHook = bucketHook);
}
