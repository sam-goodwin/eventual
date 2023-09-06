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

export interface LocalBucketStoreProps {
  localConnector: LocalEnvConnector;
}

interface ObjectData extends PutBucketOptions {
  body: Uint8Array | string | Buffer;
  contentLength: number;
  etag: string;
}

type Buckets = Record<string, Record<string, ObjectData>>;

export class LocalBucketStore implements BucketStore, LocalSerializable {
  constructor(
    private props: LocalBucketStoreProps,
    private buckets: Buckets = {}
  ) {}

  public serialize(): Record<string, Buffer> {
    return Object.fromEntries(
      Object.entries(this.buckets).flatMap(([bucketName, value]) =>
        Object.entries(value).flatMap(([objectKey, value]) => {
          const key = `${bucketName}/${objectKey}`;
          const { body, ...meta } = value;
          return [
            [key, Buffer.from(JSON.stringify(value.body))],
            [`${key}##meta`, Buffer.from(JSON.stringify(meta))],
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
      ([name]) => !name.endsWith("##meta")
    );
    const buckets: Buckets = {};
    objectBody.forEach(([key, value]) => {
      const [bucketName, ...objectKeyParts] = key.split("/") as [
        string,
        ...string[]
      ];
      const objectKey = objectKeyParts.join("/");
      const bucket = (buckets[bucketName] ??= {});
      const metaData = data[`${key}##meta`];
      const meta: Omit<ObjectData, "body"> = metaData
        ? JSON.parse(metaData.toString("utf-8"))
        : { contentLength: 0, etag: "" };
      bucket[objectKey] = {
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

  public generatePresignedUrl(
    _bucketName: string,
    _key: string,
    _operation: PresignedUrlOperation,
    _expires?: DurationSchedule | undefined
  ): Promise<BucketGeneratePresignedResult> {
    // https://github.com/functionless/eventual/issues/341
    throw new Error("Presigned urls are not supported in Eventual Local");
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
