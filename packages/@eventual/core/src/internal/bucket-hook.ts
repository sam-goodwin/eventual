import { Bucket } from "../bucket.js";

declare global {
  // eslint-disable-next-line no-var
  var eventualBucketHook: BucketHook | undefined;
}

export interface BucketDefinition {
  name: string;
}

export type BucketMethod = Exclude<
  {
    [k in keyof Bucket]: Bucket[k] extends Function ? k : never;
  }[keyof Bucket],
  "on"
>;

export type BucketHook = {
  [K in BucketMethod]: (
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
