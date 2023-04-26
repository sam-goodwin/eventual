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
import crypto from "crypto";
import { Readable, Stream } from "stream";
import { BucketStore } from "../../stores/bucket-store.js";
import { LocalEnvConnector } from "../local-container.js";
import { paginateItems } from "./pagination.js";

export interface LocalBucketStoreProps {
  localConnector: LocalEnvConnector;
}

export class LocalBucketStore implements BucketStore {
  private objects: Record<
    string,
    Record<
      string,
      {
        body: Uint8Array | string | Buffer;
        contentLength: number;
        etag: string;
      }
    >
  > = {};

  // TODO: publish events for the stream
  constructor(private props: LocalBucketStoreProps) {}
  public async get(
    bucketName: string,
    key: string,
    options?: GetBucketObjectOptions
  ): Promise<GetBucketObjectResponse | undefined> {
    const bucket = this.objects[bucketName];

    if (!bucket) {
      return undefined;
    }

    const object = bucket[key];

    if (!object) {
      return object;
    }

    if (options?.etag && options?.etag !== object.etag) {
      return undefined;
    }

    const stream = new Stream.Readable();
    stream.push(object.body);

    return {
      ...object,
      body: stream,
    };
  }

  public async put(
    bucketName: string,
    key: string,
    data: string | Buffer | Readable
  ): Promise<PutBucketObjectResponse> {
    const bucket = (this.objects[bucketName] ??= {});

    const body =
      typeof data === "string"
        ? data
        : data instanceof Buffer
        ? data
        : (data.read() as Buffer);

    const etag = getEtag(body);

    bucket[key] = {
      body,
      contentLength: body.length,
      etag,
    };

    this.props.localConnector.pushWorkflowTask({
      bucketName,
      key,
      operation: "put",
      size: body.length,
      etag,
    });

    return {
      etag,
    };
  }

  public async delete(bucketName: string, key: string): Promise<void> {
    const bucket = this.objects[bucketName];

    if (!bucket) {
      return;
    }

    delete bucket[key];

    this.props.localConnector.pushWorkflowTask({
      bucketName,
      key,
      operation: "delete",
    });
  }

  public async copyTo(
    bucketName: string,
    key: string,
    sourceKey: string,
    sourceBucket?: Bucket | undefined,
    options?: CopyBucketObjectOptions | undefined
  ): Promise<CopyBucketObjectResponse> {
    const _sourceBucket = this.objects[sourceBucket?.name ?? bucketName];

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

    const destBucket = (this.objects[bucketName] ??= {});

    destBucket[key] = sourceObject;

    this.props.localConnector.pushWorkflowTask({
      bucketName,
      key,
      operation: "copy",
      size: sourceObject.contentLength,
      etag: sourceObject.etag,
    });

    return {
      etag: sourceObject.etag,
    };
  }

  public presignedUrl(
    _bucketName: string,
    _key: string,
    _operation: "get" | "put" | "delete",
    _expires?: DurationSchedule | undefined
  ): Promise<{ url: string; expires: string }> {
    // https://github.com/functionless/eventual/issues/341
    throw new Error("Presigned urls are not supported in Eventual Local");
  }

  public async list(
    bucketName: string,
    request: ListBucketRequest
  ): Promise<ListBucketResult> {
    const bucket = this.objects[bucketName];

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
