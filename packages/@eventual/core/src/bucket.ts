import { Readable } from "node:stream";
import { getBucketHook } from "./internal/bucket-hook.js";
import {
  BucketSpec,
  BucketStreamOptions,
  BucketStreamSpec,
  isSourceLocation,
  SourceLocation,
} from "./internal/service-spec.js";
import { DurationSchedule } from "./schedule.js";

export interface BucketObjectReference {
  key: string;
  eTag: string;
  size: number;
}

export interface ListBucketResult {
  objects: BucketObjectReference[];
  keyCount: number;
  nextToken?: string;
}

export interface ListBucketRequest {
  nextToken?: string;
  startAfter?: string;
  prefix?: string;
  /**
   * @default 1000
   */
  maxKeys?: number;
}

export interface GetBucketObjectOptions {
  etag?: string;
}

export interface GetBucketObjectResponse {
  body: Readable;
  /**
   * Content length in bytes
   */
  contentLength: number;
  etag?: string;
}

export interface PutBucketObjectResponse {
  etag?: string;
}

export interface CopyBucketObjectOptions {
  sourceEtag?: string;
}

export interface CopyBucketObjectResponse {
  etag?: string;
}

export interface BucketStream extends BucketStreamSpec {
  kind: "BucketStream";
  handler: BucketStreamHandler;
  sourceLocation?: SourceLocation;
}

export interface BucketStreamHandler {
  (item: BucketStreamItem): Promise<void> | void;
}

export interface BucketStreamItemBase {
  streamName: string;
  bucketName: string;
  key: string;
}

export interface BucketStreamPutItem extends BucketStreamItemBase {
  operation: "put" | "copy";
  etag: string;
  size: number;
}

export interface BucketStreamDeleteItem extends BucketStreamItemBase {
  operation: "delete";
}

export type BucketStreamItem = BucketStreamPutItem | BucketStreamDeleteItem;

export interface Bucket extends Omit<BucketSpec, "streams"> {
  kind: "Bucket";
  streams: BucketStream[];
  get(
    key: string,
    options: GetBucketObjectOptions
  ): Promise<GetBucketObjectResponse | undefined>;
  put(
    key: string,
    data: string | Buffer | Readable
  ): Promise<PutBucketObjectResponse>;
  delete(key: string): Promise<void>;
  copyTo(
    key: string,
    sourceKey: string,
    sourceBucket?: Bucket,
    options?: CopyBucketObjectOptions
  ): Promise<CopyBucketObjectResponse>;
  presignedUrl(
    /**
     * The key that the url can act on
     */
    key: string,
    /**
     * The operation the user can perform
     */
    operation: "put" | "get" | "delete",
    /**
     * Expiration Duration
     *
     * @default - 1 hour
     */
    expires?: DurationSchedule
  ): Promise<{ url: string; expires: string }>;
  list(request: ListBucketRequest): Promise<ListBucketResult>;
  stream(
    name: string,
    options: BucketStreamOptions,
    handler: BucketStreamHandler
  ): BucketStream;
  stream(name: string, handler: BucketStreamHandler): BucketStream;
}

export function bucket(name: string): Bucket {
  const streams: BucketStream[] = [];
  return {
    name,
    streams,
    kind: "Bucket",
    get(key, options) {
      return getEventualCallHook().registerEventualCall(undefined, () => {
        return getBucketHook().get(name, key, options);
      });
    },
    put(key, data) {
      return getEventualCallHook().registerEventualCall(undefined, () => {
        return getBucketHook().put(name, key, data);
      });
    },
    copyTo(key, destKey, destBucket, options) {
      return getEventualCallHook().registerEventualCall(undefined, () => {
        return getBucketHook().copyTo(name, key, destKey, destBucket, options);
      });
    },
    delete(key) {
      return getEventualCallHook().registerEventualCall(undefined, () => {
        return getBucketHook().delete(name, key);
      });
    },
    list(request) {
      return getEventualCallHook().registerEventualCall(undefined, () => {
        return getBucketHook().list(name, request);
      });
    },
    presignedUrl(key, operation, expires) {
      return getEventualCallHook().registerEventualCall(undefined, () => {
        return getBucketHook().presignedUrl(name, key, operation, expires);
      });
    },
    stream: (
      ...args:
        | [name: string, handler: BucketStreamHandler]
        | [
            name: string,
            options: BucketStreamOptions,
            handler: BucketStreamHandler
          ]
        | [
            sourceLocation: SourceLocation,
            name: string,
            handler: BucketStreamHandler
          ]
        | [
            sourceLocation: SourceLocation,
            name: string,
            options: BucketStreamOptions,
            handler: BucketStreamHandler
          ]
    ) => {
      const [sourceLocation, streamName, options, handler] =
        args.length === 2
          ? [, args[0], , args[1]]
          : args.length === 4
          ? args
          : isSourceLocation(args[0]) && typeof args[1] === "string"
          ? [args[0], args[1] as string, , args[2]]
          : [, args[0] as string, args[1] as BucketStreamOptions, args[2]];

      const entityStream: BucketStream = {
        kind: "BucketStream",
        handler,
        name: streamName,
        bucketName: name,
        options,
        sourceLocation,
      };

      streams.push(entityStream);

      return entityStream;
    },
  };
}
