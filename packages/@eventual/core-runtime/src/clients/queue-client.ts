import type { DurationSchedule, FifoQueue } from "@eventual/core";
import { Queue } from "@eventual/core";
import {
  QueueMethod,
  QueueSendMessageOperation,
} from "@eventual/core/internal";
import type { QueueProvider } from "../providers/queue-provider.js";

type QueueClientBase = {
  [K in keyof Pick<Queue, Exclude<QueueMethod, "sendMessage">>]: (
    queueName: string,
    ...args: Parameters<Queue[K]>
  ) => ReturnType<Queue[K]>;
} & {
  sendMessage: (
    operation: QueueSendMessageOperation
  ) => ReturnType<FifoQueue["sendMessage"]>;
};

export abstract class QueueClient implements QueueClientBase {
  constructor(protected queueProvider: QueueProvider) {}

  public abstract sendMessage(
    operation: QueueSendMessageOperation
  ): Promise<void>;

  public abstract changeMessageVisibility(
    queueName: string,
    receiptHandle: string,
    timeout: DurationSchedule
  ): Promise<void>;

  public abstract deleteMessage(
    queueName: string,
    receiptHandle: string
  ): Promise<void>;

  public abstract physicalName(queueName: string): string;

  protected getQueue(queueName: string) {
    const entity = this.queueProvider.getQueue(queueName);

    if (!entity) {
      throw new Error(`Queue ${queueName} was not found.`);
    }
    return entity;
  }
}
