import type { FifoQueue, Queue } from "@eventual/core";
import { getEventualResource } from "@eventual/core/internal";

export interface QueueProvider {
  getQueue(queueName: string): FifoQueue | Queue | undefined;
}

/**
 * An executor provider that works with an out of memory store.
 */
export class GlobalQueueProvider implements QueueProvider {
  public getQueue(queueName: string): FifoQueue | Queue | undefined {
    return getEventualResource("Queue", queueName);
  }
}
