import { Bucket } from "@eventual/core";
import { BucketMethod } from "@eventual/core/internal";

export type BucketStore = {
  [K in keyof Pick<Bucket, BucketMethod>]: (
    bucketName: string,
    ...args: Parameters<Bucket[K]>
  ) => ReturnType<Bucket[K]>;
} & {
  physicalName: (bucketName: string) => string;
};
