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
  [K in keyof Pick<Bucket, BucketMethod>]: (
    bucketName: string,
    ...args: Parameters<Bucket[K]>
  ) => ReturnType<Bucket[K]>;
} & {
  physicalName: (bucketName: string) => string;
};
