import { Readable } from "node:stream";
import { getBucketHook } from "./internal/bucket-hook.js";
import {
  BucketCall,
  createEventualCall,
  EventualCallKind,
} from "./internal/calls.js";
import { registerEventualResource } from "./internal/global.js";
import {
  BucketNotificationEventType,
  BucketNotificationHandlerOptions,
  BucketNotificationHandlerSpec,
  BucketSpec,
  isSourceLocation,
  SourceLocation,
} from "./internal/service-spec.js";
import { DurationSchedule } from "./schedule.js";

export type PresignedUrlOperation = "put" | "get" | "head" | "delete";

export interface Bucket<Name extends string = string>
  extends Omit<BucketSpec<Name>, "handlers"> {
  kind: "Bucket";
  handlers: BucketNotificationHandler[];
  /**
   * Gets an object from the gets, returns undefined if the object key doesn't exist.
   */
  get(
    key: string,
    options?: GetBucketObjectOptions
  ): Promise<GetBucketObjectResponse | undefined>;
  /**
   * Gets the object metadata from the bucket, returns undefined if the object key doesn't exist.
   */
  head(
    key: string,
    options?: GetBucketObjectOptions
  ): Promise<GetBucketMetadataResponse | undefined>;
  /**
   * Creates or updates an object in a bucket.
   */
  put(
    key: string,
    data: string | Buffer | Readable,
    options?: PutBucketOptions
  ): Promise<PutBucketObjectResponse>;
  /**
   * Deletes an object from a bucket.
   */
  delete(key: string): Promise<void>;
  /**
   * Copies an object at a key to another key in the same bucket or a key in another bucket.
   */
  copyTo(
    key: string,
    sourceKey: string,
    sourceBucket?: Bucket,
    options?: CopyBucketObjectOptions
  ): Promise<CopyBucketObjectResponse>;
  /**
   * Generates an expiring url that can be used to interact with an object
   * without needing read permission to the bucket.
   *
   * For AWS, this url will be an S3 presigned url. See the s3 documentation for how to use it.
   *
   * https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html
   *
   * Presigned urls are not currently supported in Eventual Local dev server.
   */
  generatePresignedUrl(
    /**
     * The key that the url can act on
     */
    key: string,
    /**
     * The operation the user can perform
     */
    operation: PresignedUrlOperation,
    /**
     * Expiration Duration
     *
     * @default - 1 hour
     */
    expires?: DurationSchedule
  ): Promise<BucketGeneratePresignedResult>;
  /**
   * List keys and their metadata within a bucket.
   */
  list(request: ListBucketRequest): Promise<ListBucketResult>;
  /**
   * The name of the bucket in the cloud environment.
   *
   * For example, in AWS this is the s3 bucket name.
   *
   * In a local environment, this will just be the bucket name;
   */
  physicalName: string;
  /**
   * Provide a handler that is called when one of the supported events (put, delete, copy)
   * happens within a bucket.
   *
   * Support filters on key prefix and suffix.
   *
   * ```ts
   * myBucket.on("put", "putHandler", async (event) => {
   *  // start a workflow when a new object is added to the bucket.
   *  await myWorkflow.startExecution({ key: event.key });
   * });
   * ```
   */
  on<Name extends string = string>(
    events: BucketNotificationHandlerEventInput,
    name: Name,
    options: Omit<BucketNotificationHandlerOptions, "eventTypes">,
    handler: BucketNotificationHandlerFunction
  ): BucketNotificationHandler<Name>;
  on<Name extends string = string>(
    events: BucketNotificationHandlerEventInput,
    name: Name,
    handler: BucketNotificationHandlerFunction
  ): BucketNotificationHandler<Name>;
}

export function bucket<Name extends string = string>(name: Name): Bucket<Name> {
  const handlers: BucketNotificationHandler[] = [];
  return registerEventualResource("buckets", {
    name,
    handlers,
    kind: "Bucket",
    get(...args) {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<BucketCall>(EventualCallKind.BucketCall, {
          bucketName: name,
          operation: "get",
          params: args,
        }),
        () => {
          return getBucketHook().get(name, ...args);
        }
      );
    },
    head(...args) {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<BucketCall>(EventualCallKind.BucketCall, {
          bucketName: name,
          operation: "head",
          params: args,
        }),
        () => {
          return getBucketHook().head(name, ...args);
        }
      );
    },
    put(...args) {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<BucketCall>(EventualCallKind.BucketCall, {
          bucketName: name,
          operation: "put",
          params: args,
        }),
        () => {
          return getBucketHook().put(name, ...args);
        }
      );
    },
    copyTo(...args) {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<BucketCall>(EventualCallKind.BucketCall, {
          bucketName: name,
          operation: "copyTo",
          params: args,
        }),
        () => {
          return getBucketHook().copyTo(name, ...args);
        }
      );
    },
    delete(...args) {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<BucketCall>(EventualCallKind.BucketCall, {
          bucketName: name,
          operation: "delete",
          params: args,
        }),
        () => {
          return getBucketHook().delete(name, ...args);
        }
      );
    },
    list(...args) {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<BucketCall>(EventualCallKind.BucketCall, {
          bucketName: name,
          operation: "list",
          params: args,
        }),
        () => {
          return getBucketHook().list(name, ...args);
        }
      );
    },
    generatePresignedUrl(...args) {
      return getEventualCallHook().registerEventualCall(
        createEventualCall<BucketCall>(EventualCallKind.BucketCall, {
          bucketName: name,
          operation: "generatePresignedUrl",
          params: args,
        }),
        () => {
          return getBucketHook().generatePresignedUrl(name, ...args);
        }
      );
    },
    get physicalName() {
      // should be constant, can be used directly in a workflow.
      return getBucketHook().physicalName(name);
    },
    on: <Name extends string = string>(
      ...args:
        | [
            events: BucketNotificationHandlerEventInput,
            name: Name,
            handler: BucketNotificationHandlerFunction
          ]
        | [
            events: BucketNotificationHandlerEventInput,
            name: Name,
            options: Omit<BucketNotificationHandlerOptions, "eventTypes">,
            handler: BucketNotificationHandlerFunction
          ]
        | [
            sourceLocation: SourceLocation,
            events: BucketNotificationHandlerEventInput,
            name: Name,
            handler: BucketNotificationHandlerFunction
          ]
        | [
            sourceLocation: SourceLocation,
            events: BucketNotificationHandlerEventInput,
            name: Name,
            options: Omit<BucketNotificationHandlerOptions, "eventTypes">,
            handler: BucketNotificationHandlerFunction
          ]
    ) => {
      const [sourceLocation, events, streamName, options, handler] =
        args.length === 3
          ? [, args[0], args[1], , args[2]]
          : args.length === 5
          ? args
          : isSourceLocation(args[0]) && typeof args[2] === "string"
          ? [
              args[0],
              args[1] as BucketNotificationHandlerEventInput,
              args[2] as Name,
              ,
              args[3],
            ]
          : [
              ,
              args[0] as BucketNotificationHandlerEventInput,
              args[1] as Name,
              args[2] as Omit<BucketNotificationHandlerOptions, "eventTypes">,
              args[3],
            ];

      const bucketHandler: BucketNotificationHandler<Name> = {
        kind: "BucketNotificationHandler",
        handler,
        name: streamName,
        bucketName: name,
        options: {
          ...options,
          eventTypes:
            events === "all"
              ? undefined
              : Array.isArray(events)
              ? events
              : [events],
        },
        sourceLocation,
      };

      handlers.push(bucketHandler);

      return bucketHandler;
    },
  });
}

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

export interface GetBucketMetadataResponse
  extends Omit<PutBucketOptions, "contentMD5"> {
  /**
   * Content length in bytes
   */
  contentLength: number;
  etag?: string;
}

export interface GetBucketObjectResponse extends GetBucketMetadataResponse {
  body: Readable;
  /**
   * Attempts to convert the body stream into a string.
   *
   * A value is only computed once. The same value will be returned each call.
   */
  getBodyString(encoding?: BufferEncoding): Promise<string>;
}

export interface PutBucketObjectResponse {
  etag?: string;
}

export interface PutBucketOptions {
  cacheControl?: string;
  contentEncoding?: string;
  contentMD5?: string;
  contentType?: string;
  expires?: Date;
  metadata?: Record<string, string>;
}

export interface CopyBucketObjectOptions
  extends Omit<PutBucketOptions, "contentMD5"> {
  sourceEtag?: string;
}

export interface CopyBucketObjectResponse {
  etag?: string;
}

export interface BucketNotificationHandler<Name extends string = string>
  extends BucketNotificationHandlerSpec<Name> {
  kind: "BucketNotificationHandler";
  handler: BucketNotificationHandlerFunction;
  sourceLocation?: SourceLocation;
}

export interface BucketNotificationHandlerFunction {
  (item: BucketNotificationEvent): Promise<void> | void;
}

export interface BucketNotificationEventBase {
  handlerName: string;
  bucketName: string;
  key: string;
}

export interface BucketNotificationPutEvent
  extends BucketNotificationEventBase {
  event: "put" | "copy";
  etag: string;
  size: number;
}

export interface BucketNotificationDeleteEvent
  extends BucketNotificationEventBase {
  event: "delete";
}

export type BucketNotificationEvent =
  | BucketNotificationPutEvent
  | BucketNotificationDeleteEvent;

export type BucketNotificationHandlerEventInput =
  | BucketNotificationEventType[]
  | BucketNotificationEventType
  | "all";

export interface BucketGeneratePresignedResult {
  /**
   * S3 Presigned supporting the given operation.
   */
  url: string;
  /**
   * ISO 8601 timestamp representing when the url will expire.
   */
  expires: string;
}
