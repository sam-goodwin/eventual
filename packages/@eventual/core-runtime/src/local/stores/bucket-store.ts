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
import crypto from "crypto";
import { Readable } from "stream";
import type { BucketStore } from "../../stores/bucket-store.js";
import { streamToBuffer } from "../../utils.js";
import type { LocalEnvConnector } from "../local-container.js";
import type { LocalSerializable } from "../local-persistance-store.js";
import { paginateItems } from "./pagination.js";
import { computeDurationSeconds } from "../../schedule.js";

export interface LocalBucketStoreProps {
  localConnector: LocalEnvConnector;
  baseUrl: string;
}

interface ObjectData extends PutBucketOptions {
  body: Uint8Array | string | Buffer;
  contentLength: number;
  etag: string;
}

type Buckets = Record<string, Record<string, ObjectData>>;

const META_SUFFIX = ".eventual.meta.json";

export class LocalBucketStore implements BucketStore, LocalSerializable {
  constructor(
    private props: LocalBucketStoreProps,
    private buckets: Buckets = {}
  ) {}

  public serialize(): Record<string, Buffer> {
    return Object.fromEntries(
      Object.entries(this.buckets).flatMap(([bucketName, value]) =>
        Object.entries(value).flatMap(([objectKey, value]) => {
          const [prefix, ...extensionParts] = objectKey.split(".");
          const randomizer = shortHash(objectKey);
          // [bucket]/[prefix]-hash.[ext]
          const key = `${bucketName}/${prefix}-${randomizer}${
            extensionParts.length > 0 ? `.${extensionParts.join(".")}` : ""
          }`;
          const metaKey = `${bucketName}/${prefix}-${randomizer}${META_SUFFIX}`;
          const { body, ...meta } = value;
          return [
            [key, Buffer.from(value.body)],
            [metaKey, Buffer.from(JSON.stringify(meta))],
          ];
        })
      )
    );
  }

  public static fromSerializedData(
    props: LocalBucketStoreProps,
    data?: Record<string, Buffer>
  ) {
    if (!data) {
      return new LocalBucketStore(props);
    }
    const objectBody = Object.entries(data).filter(
      ([name]) => !name.endsWith(META_SUFFIX)
    );
    const buckets: Buckets = {};
    objectBody.forEach(([objKey, value]) => {
      // Expected object key format: [bucket]/[part1]/[part2]-[randomizer].[ext]
      const [bucketName, ...pathParts] = objKey.split("/") as [
        string,
        ...string[]
      ];

      // Split the last part into its prefix (before extension) and the extension
      const [prefix, ...extensionParts] =
        pathParts[pathParts.length - 1]!.split(".");

      // Extract just the [part2] from the prefix
      const mainKey = prefix!.substring(0, prefix!.lastIndexOf("-"));

      // Construct the object key without the extension: [part1]/[part2]
      const keyWithoutExtension = [
        ...pathParts.slice(0, pathParts.length - 1),
        mainKey,
      ].join("/");

      // If there's an extension, add it back to get the full object key
      const fullObjectKey =
        extensionParts.length > 0
          ? `${keyWithoutExtension}.${extensionParts.join(".")}`
          : keyWithoutExtension;

      // Retrieve bucket and meta data for the object
      const bucket = buckets[bucketName] || (buckets[bucketName] = {});

      // meta key is the key prefixed with the bucket name and the path without the extension, followed by the meta suffix
      const metakey = `${[
        bucketName,
        ...pathParts.slice(0, pathParts.length - 1),
        prefix,
      ].join("/")}${META_SUFFIX}`;
      const metaDataContent = data[metakey];

      // Parse meta data and construct the final object data
      const meta: Omit<ObjectData, "body"> = metaDataContent
        ? JSON.parse(metaDataContent.toString("utf-8"))
        : { contentLength: 0, etag: "" };

      bucket[fullObjectKey] = {
        ...meta,
        body: value,
      };
    });
    return new LocalBucketStore(props, buckets);
  }

  public async get(
    bucketName: string,
    key: string,
    options?: GetBucketObjectOptions
  ): Promise<GetBucketObjectResponse | undefined> {
    const obj = this.getObjectFromMap(bucketName, key, options);

    if (!obj) {
      return undefined;
    }

    const stream = new Readable();
    stream.push(obj.body);
    stream.push(null);

    return {
      ...obj.objectMetadata,
      body: stream,
      async getBodyString() {
        return Buffer.from(obj.body).toString();
      },
    };
  }

  public async head(
    bucketName: string,
    key: string,
    options?: GetBucketObjectOptions
  ): Promise<GetBucketMetadataResponse | undefined> {
    const { objectMetadata } =
      this.getObjectFromMap(bucketName, key, options) ?? {};

    return objectMetadata;
  }

  private getObjectFromMap(
    bucketName: string,
    key: string,
    options?: GetBucketObjectOptions
  ) {
    const bucket = this.buckets[bucketName];

    if (!bucket) {
      return undefined;
    }

    const object = bucket[key];

    if (!object) {
      return object;
    }

    const { body, ...objectMetadata } = object;

    if (options?.etag && options?.etag !== object.etag) {
      return undefined;
    }

    return {
      body,
      objectMetadata,
    };
  }

  public async put(
    bucketName: string,
    key: string,
    data: string | Buffer | Readable,
    options?: PutBucketOptions
  ): Promise<PutBucketObjectResponse> {
    const bucket = (this.buckets[bucketName] ??= {});

    const body =
      typeof data === "string"
        ? data
        : data instanceof Buffer
        ? data
        : await streamToBuffer(data);

    const etag = getEtag(body);

    bucket[key] = {
      body,
      contentLength: body.length,
      etag,
      ...options,
    };

    this.props.localConnector.pushWorkflowTask({
      bucketName,
      key,
      event: "put",
      size: body.length,
      etag,
    });

    return {
      etag,
    };
  }

  public async delete(bucketName: string, key: string): Promise<void> {
    const bucket = this.buckets[bucketName];

    if (!bucket) {
      return;
    }

    delete bucket[key];

    this.props.localConnector.pushWorkflowTask({
      bucketName,
      key,
      event: "delete",
    });
  }

  public async copyTo(
    bucketName: string,
    key: string,
    sourceKey: string,
    sourceBucket?: Bucket | undefined,
    options?: CopyBucketObjectOptions | undefined
  ): Promise<CopyBucketObjectResponse> {
    const _sourceBucket = this.buckets[sourceBucket?.name ?? bucketName];

    if (!_sourceBucket) {
      return {};
    }

    const sourceObject = _sourceBucket[sourceKey];

    if (
      !sourceObject ||
      (options?.sourceEtag && options.sourceEtag !== sourceObject.etag)
    ) {
      return {};
    }

    const destBucket = (this.buckets[bucketName] ??= {});

    destBucket[key] = {
      ...sourceObject,
      cacheControl: options?.cacheControl ?? sourceObject.cacheControl,
      contentEncoding: options?.contentEncoding ?? sourceObject.contentEncoding,
      contentType: options?.contentType ?? sourceObject.contentType,
      expires: options?.expires ?? sourceObject.expires,
      metadata: options?.metadata ?? sourceObject.metadata,
    };

    this.props.localConnector.pushWorkflowTask({
      bucketName,
      key,
      event: "copy",
      size: sourceObject.contentLength,
      etag: sourceObject.etag,
    });

    return {
      etag: sourceObject.etag,
    };
  }

  public async generatePresignedUrl(
    bucketName: string,
    key: string,
    operation: PresignedUrlOperation,
    expires?: DurationSchedule | undefined
  ): Promise<BucketGeneratePresignedResult> {
    // https://github.com/functionless/eventual/issues/341
    const expireDuration = expires
      ? computeDurationSeconds(expires)
      : // default 1 hour
        3_600;
    if (expireDuration > 604800) {
      throw new Error(
        "Presigned URL expiration must be less than or equal to 7 days (604800 seconds)"
      );
    }
    const expiration = new Date(
      this.props.localConnector.getTime().getTime() + expireDuration * 1000
    );
    const data: PresignUrlEnvelope = {
      bucketName,
      key,
      operation,
      expires: expiration.toISOString(),
    };

    return {
      url: `${this.props.baseUrl}/__bucket/presigned/${Buffer.from(
        JSON.stringify(data)
      ).toString("base64url")}`,
      expires: expiration.toISOString(),
    };
  }

  public decodeAsyncUrlKey(
    key: string,
    assertOperation?: PresignedUrlOperation
  ): PresignUrlEnvelope {
    const data = JSON.parse(Buffer.from(key, "base64url").toString("utf-8"));
    if (assertOperation && data.operation !== assertOperation) {
      throw new Error(
        "Presigned URL operation does not match expected operation"
      );
    }
    return data;
  }

  public async list(
    bucketName: string,
    request: ListBucketRequest
  ): Promise<ListBucketResult> {
    const bucket = this.buckets[bucketName];

    if (!bucket) {
      return {
        keyCount: 0,
        objects: [],
      };
    }

    const paged = paginateItems(
      Object.entries(bucket),
      (a, b) => a[0].localeCompare(b[0]),
      ([key]) =>
        (!request.startAfter || key > request.startAfter) &&
        (!request.prefix || key.startsWith(request.prefix)),
      "ASC",
      request.maxKeys,
      request.nextToken
    );

    return {
      keyCount: paged.filteredCount,
      objects: paged.items.map(([key, obj]) => ({
        key,
        size: obj.contentLength,
        eTag: obj.etag,
      })),
      nextToken: paged.nextToken,
    };
  }

  public physicalName(bucketName: string) {
    return bucketName;
  }
}

const chunk = 1024 * 1024 * 5; // 5MB

function md5(data: Uint8Array | string) {
  return crypto.createHash("md5").update(data).digest("hex");
}

function getEtag(data: Uint8Array | string) {
  if (data.length <= chunk) {
    return md5(data);
  }
  const md5Chunks = [];
  const chunksNumber = Math.ceil(data.length / chunk);
  for (let i = 0; i < chunksNumber; i++) {
    const chunkStream = data.slice(i * chunk, (i + 1) * chunk);
    md5Chunks.push(md5(chunkStream));
  }

  return `${md5(Buffer.from(md5Chunks.join(""), "hex"))}-${chunksNumber}`;
}

function shortHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16); // Convert the integer to a hex string
}

export interface PresignUrlEnvelope {
  bucketName: string;
  key: string;
  operation: PresignedUrlOperation;
  expires: string;
}
