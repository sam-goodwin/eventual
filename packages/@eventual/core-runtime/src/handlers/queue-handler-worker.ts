import {
  type FifoQueueHandlerMessageItem,
  type QueueHandlerContext,
  type QueueHandlerMessageItem,
} from "@eventual/core";
import { ServiceType, getEventualResource } from "@eventual/core/internal";
import { getLazy } from "../utils.js";
import { createEventualWorker, type WorkerIntrinsicDeps } from "./worker.js";

export type QueueHandlerDependencies = WorkerIntrinsicDeps;

export interface QueueHandlerWorker {
  (
    queueName: string,
    items: (FifoQueueHandlerMessageItem | QueueHandlerMessageItem)[]
  ): Promise<void | { failedMessageIds: string[] }>;
}

export function createQueueHandlerWorker(
  dependencies: QueueHandlerDependencies
): QueueHandlerWorker {
  return createEventualWorker(
    { serviceType: ServiceType.QueueHandlerWorker, ...dependencies },
    async (queueName, items) => {
      const queue = getEventualResource("Queue", queueName);
      if (!queue) throw new Error(`Queue ${queueName} does not exist`);
      const handler = queue.handler;

      const context: QueueHandlerContext = {
        queue: { queueName, fifo: queue.fifo },
        service: {
          serviceName: getLazy(dependencies.serviceName),
          serviceUrl: getLazy(dependencies.serviceUrl),
        },
      };

      const result = await handler.handler(
        items as FifoQueueHandlerMessageItem[],
        context
      );
      if (result?.failedMessageIds && result.failedMessageIds.length > 0) {
        return { failedMessageIds: result.failedMessageIds };
      }
      return undefined;
    }
  );
}
