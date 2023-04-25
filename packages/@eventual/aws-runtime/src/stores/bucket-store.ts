import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  Bucket,
  CopyBucketObjectOptions,
  CopyBucketObjectResponse,
  DurationSchedule,
  GetBucketObjectOptions,
  GetBucketObjectResponse,
  ListBucketRequest,
  ListBucketResult,
  PutBucketObjectResponse,
} from "@eventual/core";
import {
  BucketStore,
  computeDurationSeconds,
  getLazy,
  LazyValue,
} from "@eventual/core-runtime";
import { assertNever } from "@eventual/core/internal";
import { Readable } from "stream";
import { bucketServiceBucketName } from "../utils.js";

export interface AWSBucketStoreProps {
  s3: S3Client;
  serviceName: LazyValue<string>;
}

export class AWSBucketStore implements BucketStore {
  constructor(private props: AWSBucketStoreProps) {}
  async get(
    bucketName: string,
    key: string,
    options?: GetBucketObjectOptions
  ): Promise<GetBucketObjectResponse | undefined> {
    const result = await this.props.s3.send(
      new GetObjectCommand({
        Bucket: this.bucketName(bucketName),
        Key: key,
        IfMatch: options?.etag,
      })
    );

    return result.Body
      ? {
          body: result.Body as Readable,
          contentLength: result.ContentLength!,
          etag: result.ETag,
        }
      : undefined;
  }

  async put(
    bucketName: string,
    key: string,
    data: string | Readable | Buffer
  ): Promise<PutBucketObjectResponse> {
    const result = await this.props.s3.send(
      new PutObjectCommand({
        Bucket: this.bucketName(bucketName),
        Key: key,
        Body: data,
      })
    );

    return {
      etag: result.ETag,
    };
  }

  async delete(bucketName: string, key: string): Promise<void> {
    await this.props.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName(bucketName),
        Key: key,
      })
    );
  }

  async copyTo(
    bucketName: string,
    key: string,
    destKey: string,
    destBucket?: Bucket | undefined,
    options?: CopyBucketObjectOptions | undefined
  ): Promise<CopyBucketObjectResponse> {
    const result = await this.props.s3.send(
      new CopyObjectCommand({
        Bucket: this.bucketName(bucketName),
        Key: destKey,
        CopySource: `${
          destBucket
            ? this.bucketName(destBucket.name)
            : this.bucketName(bucketName)
        }/${key}`,
        CopySourceIfMatch: options?.sourceEtag,
      })
    );

    return {
      etag: result.CopyObjectResult?.ETag,
    };
  }

  async presignedUrl(
    bucketName: string,
    key: string,
    operation: "get" | "put" | "delete",
    expires?: DurationSchedule | undefined
  ): Promise<{ url: string; expires: string }> {
    const request =
      operation === "get"
        ? new GetObjectCommand({
            Bucket: this.bucketName(bucketName),
            Key: key,
          })
        : operation === "put"
        ? new PutObjectCommand({
            Bucket: this.bucketName(bucketName),
            Key: key,
          })
        : operation === "delete"
        ? new DeleteObjectCommand({
            Bucket: this.bucketName(bucketName),
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

  async list(
    bucketName: string,
    request: ListBucketRequest
  ): Promise<ListBucketResult> {
    const result = await this.props.s3.send(
      new ListObjectsV2Command({
        Bucket: this.bucketName(bucketName),
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

  private bucketName(bucketName: string) {
    return bucketServiceBucketName(getLazy(this.props.serviceName), bucketName);
  }
}
