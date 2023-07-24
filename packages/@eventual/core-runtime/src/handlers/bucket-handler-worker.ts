import type { BucketNotificationEvent } from "@eventual/core";
import { getEventualResource, ServiceType } from "@eventual/core/internal";
import { serviceTypeScope } from "../service-type.js";
import { registerWorkerIntrinsics, type WorkerIntrinsicDeps } from "./utils.js";

export interface BucketNotificationHandlerWorker {
  (item: BucketNotificationEvent): void | Promise<void>;
}

type BucketNotificationHandlerWorkerDependencies = WorkerIntrinsicDeps;

export function createBucketNotificationHandlerWorker(
  dependencies: BucketNotificationHandlerWorkerDependencies
): BucketNotificationHandlerWorker {
  registerWorkerIntrinsics(dependencies);

  return async (item) =>
    serviceTypeScope(ServiceType.BucketNotificationHandlerWorker, async () => {
      const streamHandler = getEventualResource(
        "Bucket",
        item.bucketName
      )?.handlers.find((s) => s.name === item.handlerName);
      if (!streamHandler) {
        throw new Error(`Stream handler ${item.handlerName} does not exist`);
      }
      return await streamHandler.handler(item);
    });
}
