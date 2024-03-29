import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
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
  computeDurationSeconds,
  getLazy,
  type BucketStore,
  type LazyValue,
  streamToBuffer,
} from "@eventual/core-runtime";
import { assertNever } from "@eventual/core/internal";
import { Readable } from "stream";
import { bucketServiceBucketName } from "../utils.js";

export interface BucketRuntimeOverrides {
  /**
   * Override the s3 bucket name of the bucket.
   */
  bucketName?: string;
}

export interface AWSBucketStoreProps {
  s3: S3Client;
  serviceName: LazyValue<string>;
  bucketOverrides: LazyValue<Record<string, BucketRuntimeOverrides>>;
  accountID: LazyValue<string>;
  region: LazyValue<string>;
}

export class AWSBucketStore implements BucketStore {
  constructor(private props: AWSBucketStoreProps) {}

  public async get(
    bucketName: string,
    key: string,
    options?: GetBucketObjectOptions
  ): Promise<GetBucketObjectResponse | undefined> {
    const result = await this.props.s3.send(
      new GetObjectCommand({
        Bucket: this.physicalName(bucketName),
        Key: key,
        IfMatch: options?.etag,
      })
    );

    let bodyString: undefined | string;

    return result.Body
      ? {
          body: result.Body as Readable,
          contentLength: result.ContentLength!,
          etag: result.ETag!,
          cacheControl: result.CacheControl,
          contentEncoding: result.ContentEncoding,
          contentType: result.ContentType,
          expires: result.Expires,
          metadata: result.Metadata,
          async getBodyString(encoding) {
            if (bodyString !== undefined) {
              return bodyString;
            }
            return (bodyString = await result.Body!.transformToString(
              encoding
            ));
          },
        }
      : undefined;
  }

  public async head(
    bucketName: string,
    key: string,
    options?: GetBucketObjectOptions
  ): Promise<GetBucketMetadataResponse | undefined> {
    const result = await this.props.s3.send(
      new HeadObjectCommand({
        Bucket: this.physicalName(bucketName),
        Key: key,
        IfMatch: options?.etag,
      })
    );

    return result.ContentLength !== undefined
      ? {
          contentLength: result.ContentLength,
          etag: result.ETag!,
          metadata: result.Metadata,
        }
      : undefined;
  }

  public async put(
    bucketName: string,
    key: string,
    data: string | Readable | Buffer,
    options?: PutBucketOptions
  ): Promise<PutBucketObjectResponse> {
    const result = await this.props.s3.send(
      new PutObjectCommand({
        Bucket: this.physicalName(bucketName),
        Key: key,
        // S3 requires the content length when given a stream, we'll just give them a buffer instead
        Body: data instanceof Readable ? await streamToBuffer(data) : data,
        CacheControl: options?.cacheControl,
        ContentEncoding: options?.contentEncoding,
        ContentMD5: options?.contentMD5,
        ContentType: options?.contentType,
        Expires: options?.expires,
        Metadata: options?.metadata,
      })
    );

    return {
      etag: result.ETag!,
    };
  }

  public async delete(bucketName: string, key: string): Promise<void> {
    await this.props.s3.send(
      new DeleteObjectCommand({
        Bucket: this.physicalName(bucketName),
        Key: key,
      })
    );
  }

  public async copyTo(
    bucketName: string,
    key: string,
    sourceKey: string,
    sourceBucket?: Bucket | undefined,
    options?: CopyBucketObjectOptions | undefined
  ): Promise<CopyBucketObjectResponse> {
    const result = await this.props.s3.send(
      new CopyObjectCommand({
        Bucket: this.physicalName(bucketName),
        Key: key,
        CopySource: `${
          sourceBucket
            ? this.physicalName(sourceBucket.name)
            : this.physicalName(bucketName)
        }/${sourceKey}`,
        CopySourceIfMatch: options?.sourceEtag,
        CacheControl: options?.cacheControl,
        ContentEncoding: options?.contentEncoding,
        ContentType: options?.contentType,
        Expires: options?.expires,
        Metadata: options?.metadata,
      })
    );

    return {
      etag: result.CopyObjectResult?.ETag,
    };
  }

  public async generatePresignedUrl(
    bucketName: string,
    key: string,
    operation: PresignedUrlOperation,
    expires?: DurationSchedule | undefined
  ): Promise<BucketGeneratePresignedResult> {
    const request =
      operation === "get"
        ? new GetObjectCommand({
            Bucket: this.physicalName(bucketName),
            Key: key,
          })
        : operation === "put"
        ? new PutObjectCommand({
            Bucket: this.physicalName(bucketName),
            Key: key,
          })
        : operation === "delete"
        ? new DeleteObjectCommand({
            Bucket: this.physicalName(bucketName),
            Key: key,
          })
        : operation === "head"
        ? new HeadObjectCommand({
            Bucket: this.physicalName(bucketName),
            Key: key,
          })
        : assertNever(operation);
    const _expires = expires ? computeDurationSeconds(expires) : 3600;
    const url = await getSignedUrl(this.props.s3, request, {
      expiresIn: _expires,
    });

    return {
      expires: new Date(new Date().getTime() + _expires * 1000).toISOString(),
      url,
    };
  }

  public async list(
    bucketName: string,
    request: ListBucketRequest
  ): Promise<ListBucketResult> {
    const result = await this.props.s3.send(
      new ListObjectsV2Command({
        Bucket: this.physicalName(bucketName),
        Prefix: request.prefix,
        ContinuationToken: request.nextToken,
        StartAfter: request.startAfter,
        MaxKeys: request.maxKeys,
      })
    );

    return {
      keyCount: result.KeyCount ?? 0,
      nextToken: result.NextContinuationToken,
      objects:
        result.Contents?.filter((c) => c.Key).map((c) => ({
          eTag: c.ETag!,
          key: c.Key!,
          size: c.Size ?? 0,
        })) ?? [],
    };
  }

  public physicalName(bucketName: string) {
    const overrides = getLazy(this.props.bucketOverrides);
    const nameOverride = overrides[bucketName]?.bucketName;
    return (
      nameOverride ??
      bucketServiceBucketName(
        getLazy(this.props.serviceName),
        bucketName,
        getLazy(this.props.accountID),
        getLazy(this.props.region)
      )
    );
  }
}
