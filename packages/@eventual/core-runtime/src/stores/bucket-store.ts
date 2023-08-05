import {
  Bucket,
  BucketGeneratePresignedResult,
  CopyBucketObjectOptions,
  CopyBucketObjectResponse,
  DurationSchedule,
  GetBucketMetadataResponse,
  GetBucketObjectOptions,
  GetBucketObjectResponse,
  ListBucketRequest,
  ListBucketResult,
  PresignedUrlOperation,
  PutBucketObjectResponse,
  PutBucketOptions,
} from "@eventual/core";
import {
  BucketCall,
  BucketMethod,
  BucketPhysicalName,
  EventualPromise,
} from "@eventual/core/internal";
import { Readable } from "stream";
import {
  EventualExecutor,
  EventualPropertyResolver,
} from "../eventual-hook.js";

type BucketStoreBase = {
  [K in keyof Pick<Bucket, BucketMethod>]: (
    bucketName: string,
    ...args: Parameters<Bucket[K]>
  ) => ReturnType<Bucket[K]>;
} & {
  physicalName: (bucketName: string) => string;
};

export abstract class BucketStore
  implements
    BucketStoreBase,
    EventualExecutor<BucketCall>,
    EventualPropertyResolver<BucketPhysicalName>
{
  public abstract get(
    bucketName: string,
    key: string,
    options?: GetBucketObjectOptions | undefined
  ): Promise<GetBucketObjectResponse | undefined>;

  public abstract head(
    bucketName: string,
    key: string,
    options?: GetBucketObjectOptions | undefined
  ): Promise<GetBucketMetadataResponse | undefined>;

  public abstract put(
    bucketName: string,
    key: string,
    data: string | Buffer | Readable,
    options?: PutBucketOptions | undefined
  ): Promise<PutBucketObjectResponse>;

  public abstract delete(bucketName: string, key: string): Promise<void>;
  public abstract copyTo(
    bucketName: string,
    key: string,
    sourceKey: string,
    sourceBucket?: Bucket<string> | undefined,
    options?: CopyBucketObjectOptions | undefined
  ): Promise<CopyBucketObjectResponse>;

  public abstract generatePresignedUrl(
    bucketName: string,
    key: string,
    operation: PresignedUrlOperation,
    expires?: DurationSchedule | undefined
  ): Promise<BucketGeneratePresignedResult>;

  public abstract list(
    bucketName: string,
    request: ListBucketRequest
  ): Promise<ListBucketResult>;

  public abstract physicalName(bucketName: string): string;
  public execute(call: BucketCall): Promise<any> | EventualPromise<any> {
    // @ts-ignore - typescript won't let me case the params...
    return this[call.operation](call.bucketName, ...call.params);
  }

  public getProperty(property: BucketPhysicalName): string {
    return this.physicalName(property.bucketName);
  }
}
