import type {
  DurationSchedule,
  FifoQueue,
  Queue,
  QueueBatchResponse,
  QueueDeleteBatchEntry,
} from "@eventual/core";
import type {
  QueueMethod,
  QueueSendMessageBatchOperation,
  QueueSendMessageOperation,
} from "@eventual/core/internal";
import type { QueueProvider } from "../providers/queue-provider.js";

type QueueClientBase = {
  [K in keyof Pick<
    Queue,
    Exclude<QueueMethod, "sendMessage" | "sendMessageBatch">
  >]: (
    queueName: string,
    ...args: Parameters<Queue[K]>
  ) => ReturnType<Queue[K]>;
} & {
  sendMessage: (
    operation: QueueSendMessageOperation
  ) => ReturnType<FifoQueue["sendMessage"]>;
  sendMessageBatch: (
    operation: QueueSendMessageBatchOperation
  ) => ReturnType<FifoQueue["sendMessageBatch"]>;
};

export abstract class QueueClient implements QueueClientBase {
  constructor(protected queueProvider: QueueProvider) {}

  public abstract sendMessage(
    operation: QueueSendMessageOperation
  ): Promise<void>;

  public abstract sendMessageBatch(
    operation: QueueSendMessageBatchOperation
  ): Promise<QueueBatchResponse>;

  public abstract changeMessageVisibility(
    queueName: string,
    receiptHandle: string,
    timeout: DurationSchedule
  ): Promise<void>;

  public abstract deleteMessage(
    queueName: string,
    receiptHandle: string
  ): Promise<void>;

  public abstract deleteMessageBatch(
    queueName: string,
    entries: QueueDeleteBatchEntry[]
  ): Promise<QueueBatchResponse>;

  public abstract physicalName(queueName: string): string;

  protected getQueue(queueName: string) {
    const entity = this.queueProvider.getQueue(queueName);

    if (!entity) {
      throw new Error(`Queue ${queueName} was not found.`);
    }
    return entity;
  }
}
