import { BucketStreamItem } from "@eventual/core";
import {
  buckets,
  ServiceType,
  serviceTypeScope,
} from "@eventual/core/internal";
import { registerWorkerIntrinsics, WorkerIntrinsicDeps } from "./utils.js";

export interface BucketStreamWorker {
  (item: BucketStreamItem): void | Promise<void>;
}

interface BucketStreamWorkerDependencies extends WorkerIntrinsicDeps {}

export function createBucketStreamWorker(
  dependencies: BucketStreamWorkerDependencies
): BucketStreamWorker {
  registerWorkerIntrinsics(dependencies);

  return async (item) =>
    serviceTypeScope(ServiceType.BucketStreamWorker, async () => {
      const streamHandler = buckets()
        .get(item.bucketName)
        ?.streams.find((s) => s.name === item.streamName);
      if (!streamHandler) {
        throw new Error(`Stream handler ${item.streamName} does not exist`);
      }
      return await streamHandler.handler(item);
    });
}
