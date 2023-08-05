import type { BucketNotificationEvent } from "@eventual/core";
import { getEventualResource, ServiceType } from "@eventual/core/internal";
import { createEventualWorker, type WorkerIntrinsicDeps } from "./worker.js";

export interface BucketNotificationHandlerWorker {
  (item: BucketNotificationEvent): void | Promise<void>;
}

type BucketNotificationHandlerWorkerDependencies = WorkerIntrinsicDeps;

export function createBucketNotificationHandlerWorker(
  dependencies: BucketNotificationHandlerWorkerDependencies
): BucketNotificationHandlerWorker {
  return createEventualWorker(
    ServiceType.BucketNotificationHandlerWorker,
    dependencies,
    async (item) => {
      const streamHandler = getEventualResource(
        "Bucket",
        item.bucketName
      )?.handlers.find((s) => s.name === item.handlerName);
      if (!streamHandler) {
        throw new Error(`Stream handler ${item.handlerName} does not exist`);
      }
      return await streamHandler.handler(item);
    }
  );
}
