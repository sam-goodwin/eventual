import {
  ChangeMessageVisibilityCommand,
  DeleteMessageBatchCommand,
  DeleteMessageCommand,
  SendMessageBatchCommand,
  SendMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import {
  isFifoContentBasedDeduplication,
  type DurationSchedule,
  type QueueBatchResponse,
  type QueueDeleteBatchEntry,
} from "@eventual/core";
import {
  computeDurationSeconds,
  getLazy,
  QueueClient,
  type LazyValue,
  type QueueProvider,
} from "@eventual/core-runtime";
import type {
  QueueSendMessageBatchOperation,
  QueueSendMessageOperation,
} from "@eventual/core/internal";
import { queueServiceQueueName } from "../utils.js";

export interface QueueRuntimeOverrides {
  /**
   * Override the queue name of the queue.
   */
  queueName?: string;
}

export interface AWSQueueClientProps {
  sqs: SQSClient;
  queueProvider: QueueProvider;
  awsAccount: LazyValue<string>;
  awsRegion: LazyValue<string>;
  serviceName: LazyValue<string>;
  queueOverrides: LazyValue<Record<string, QueueRuntimeOverrides>>;
}

export class AWSQueueClient extends QueueClient {
  constructor(private props: AWSQueueClientProps) {
    super(props.queueProvider);
  }

  public override async sendMessage(
    operation: QueueSendMessageOperation
  ): Promise<void> {
    await this.props.sqs.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(operation.message),
        QueueUrl: this.physicalQueueUrl(operation.queueName),
        DelaySeconds: operation.delay
          ? computeDurationSeconds(operation.delay)
          : undefined,
        MessageDeduplicationId:
          // message deduplication is only supported for FIFO queues
          // if fifo, deduplication id is required unless the definition asserts content based deduplication is on.
          !operation.fifo ||
          isFifoContentBasedDeduplication(operation.messageDeduplicationId)
            ? undefined
            : operation.messageDeduplicationId,
        MessageGroupId: operation.fifo ? operation.messageGroupId : undefined,
      })
    );
  }

  public override async sendMessageBatch(
    operation: QueueSendMessageBatchOperation
  ): Promise<QueueBatchResponse> {
    const result = await this.props.sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: this.physicalQueueUrl(operation.queueName),
        Entries: operation.fifo
          ? operation.entries.map((m) => ({
              Id: m.id,
              MessageBody: JSON.stringify(m.message),
              DelaySeconds: m.delay
                ? computeDurationSeconds(m.delay)
                : undefined,
              MessageDeduplicationId:
                // message deduplication is only supported for FIFO queues
                // if fifo, deduplication id is required unless the definition asserts content based deduplication is on.
                isFifoContentBasedDeduplication(m.messageDeduplicationId)
                  ? undefined
                  : m.messageDeduplicationId,
              MessageGroupId: m.messageGroupId,
            }))
          : operation.entries.map((m) => ({
              Id: m.id,
              MessageBody: JSON.stringify(m.message),
              DelaySeconds: m.delay
                ? computeDurationSeconds(m.delay)
                : undefined,
            })),
      })
    );

    return {
      failed: result.Failed?.map((f) => ({ id: f.Id!, message: f.Message })),
    };
  }

  public override async changeMessageVisibility(
    queueName: string,
    receiptHandle: string,
    timeout: DurationSchedule
  ): Promise<void> {
    await this.props.sqs.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: this.physicalQueueUrl(queueName),
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: computeDurationSeconds(timeout),
      })
    );
  }

  public override async deleteMessage(
    queueName: string,
    receiptHandle: string
  ): Promise<void> {
    await this.props.sqs.send(
      new DeleteMessageCommand({
        QueueUrl: this.physicalQueueUrl(queueName),
        ReceiptHandle: receiptHandle,
      })
    );
  }

  public override async deleteMessageBatch(
    queueName: string,
    entries: QueueDeleteBatchEntry[]
  ): Promise<QueueBatchResponse> {
    const result = await this.props.sqs.send(
      new DeleteMessageBatchCommand({
        QueueUrl: this.physicalQueueUrl(queueName),
        Entries: entries.map((e) => ({
          Id: e.id,
          ReceiptHandle: e.receiptHandle,
        })),
      })
    );

    return {
      failed: result.Failed?.map((f) => ({ id: f.Id!, message: f.Message })),
    };
  }

  public physicalQueueUrl(queueName: string) {
    return `https://sqs.${getLazy(
      this.props.awsRegion
    )}.amazonaws.com/${getLazy(this.props.awsAccount)}/${this.physicalName(
      queueName
    )}`;
  }

  public override physicalName(queueName: string) {
    const overrides = getLazy(this.props.queueOverrides);
    const nameOverride = overrides[queueName]?.queueName;
    const queue = this.getQueue(queueName);
    return (
      nameOverride ??
      queueServiceQueueName(
        getLazy(this.props.serviceName),
        queueName,
        queue.fifo
      )
    );
  }
}
