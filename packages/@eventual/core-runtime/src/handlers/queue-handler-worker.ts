import {
  isFifoQueue,
  type FifoQueueHandler,
  type FifoQueueHandlerMessageItem,
  type QueueHandlerContext,
  type QueueHandlerMessageItem,
} from "@eventual/core";
import { ServiceType, getEventualResource } from "@eventual/core/internal";
import {
  getLazy,
  groupedPromiseAllSettled,
  promiseAllSettledPartitioned,
} from "../utils.js";
import { createEventualWorker, type WorkerIntrinsicDeps } from "./worker.js";

export type QueueHandlerDependencies = WorkerIntrinsicDeps;

export interface QueueHandler {
  (
    queueName: string,
    handlerName: string,
    items: (FifoQueueHandlerMessageItem | QueueHandlerMessageItem)[]
  ): Promise<void | { failedMessageIds: string[] }>;
}

export function createQueueHandlerWorker(
  dependencies: QueueHandlerDependencies
): QueueHandler {
  return createEventualWorker(
    { serviceType: ServiceType.QueueHandlerWorker, ...dependencies },
    async (queueName, handlerName, items) => {
      const queue = getEventualResource("Queue", queueName);
      if (!queue) throw new Error(`Queue ${queueName} does not exist`);
      if (isFifoQueue(queue)) {
        const handler = queue.handlers.find((h) => h.name === handlerName);

        if (!handler) throw new Error(`Handler ${handlerName} does not exist`);

        const context: QueueHandlerContext = {
          queue: { queueName, fifo: queue.fifo },
          queueHandler: { batch: handler.batch, queueHandlerName: handlerName },
          service: {
            serviceName: getLazy(dependencies.serviceName),
            serviceUrl: getLazy(dependencies.serviceUrl),
          },
        };

        if (handler.kind === "QueueBatchHandler") {
          const result = await handler.handler(
            items as FifoQueueHandlerMessageItem[],
            context
          );
          if (result?.failedMessageIds && result.failedMessageIds.length > 0) {
            return { failedMessageIds: result.failedMessageIds };
          }
          return undefined;
        } else {
          // fifo queue needs to maintain order of messages and fail preceding messages.
          // in AWS, failing a message out of order will cause an error.
          // ex: ([A, B]; A fails and B does not, AWS will throw an error on delete).
          const groupResults = await groupedPromiseAllSettled(
            items as FifoQueueHandlerMessageItem[],
            (item) => item.messageGroupId,
            async (item) => {
              const result = (handler as FifoQueueHandler).handler(
                item,
                context
              );
              if (result === false) {
                throw new Error("Handler reported failure");
              }
              return result;
            }
          );

          return {
            failedMessageIds: Object.values(groupResults).flatMap((g) =>
              g.rejected.map(([item]) => item.id)
            ),
          };
        }
      } else {
        const handler = queue.handlers.find((h) => h.name === handlerName);

        if (!handler) {
          throw new Error(`Handler ${handlerName} does not exist`);
        }

        const context: QueueHandlerContext = {
          queue: { queueName, fifo: queue.fifo },
          queueHandler: { batch: handler.batch, queueHandlerName: handlerName },
          service: {
            serviceName: getLazy(dependencies.serviceName),
            serviceUrl: getLazy(dependencies.serviceUrl),
          },
        };

        if (handler?.kind === "QueueBatchHandler") {
          const result = await handler.handler(
            items as QueueHandlerMessageItem[],
            context
          );

          if (result?.failedMessageIds && result.failedMessageIds.length > 0) {
            return { failedMessageIds: result.failedMessageIds ?? [] };
          }
          return undefined;
        } else {
          // normal queue handler doesn't have a concept of order, pass all messages in any order.
          const results = await promiseAllSettledPartitioned(
            items,
            async (item) => handler.handler(item, context)
          );

          return {
            failedMessageIds: results.rejected.map(([item]) => item.id),
          };
        }
      }
    }
  );
}
