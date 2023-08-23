import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import {
  isFifoContentBasedDeduplication,
  type DurationSchedule,
} from "@eventual/core";
import {
  computeDurationSeconds,
  getLazy,
  type LazyValue,
  QueueClient,
  type QueueProvider,
} from "@eventual/core-runtime";
import type { QueueSendMessageOperation } from "@eventual/core/internal";
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
