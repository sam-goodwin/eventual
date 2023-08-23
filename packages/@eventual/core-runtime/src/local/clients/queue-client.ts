import {
  DEFAULT_QUEUE_VISIBILITY_TIMEOUT,
  type DurationSchedule,
  type FifoQueue,
  type FifoQueueHandlerMessageItem,
  type Queue,
  type StandardQueueHandlerMessageItem,
} from "@eventual/core";
import type { QueueSendMessageOperation } from "@eventual/core/internal";
import { ulid } from "ulidx";
import { QueueClient } from "../../clients/queue-client.js";
import {
  computeScheduleDate,
  type LocalEnvConnector,
  type QueueProvider,
} from "../../index.js";

export interface QueueRetrieveMessagesRequest {
  maxMessages?: number;
  visibilityTimeout?: DurationSchedule;
}

/**
 * TODO: implement message deduplication
 */
export class LocalQueueClient extends QueueClient {
  constructor(
    queueProvider: QueueProvider,
    private localConnector: LocalEnvConnector
  ) {
    super(queueProvider);
  }

  private readonly queues: Map<string, LocalQueue> = new Map();

  public receiveMessages(
    queueName: string,
    request?: QueueRetrieveMessagesRequest
  ) {
    const queue = this.queues.get(queueName);
    return queue ? queue.receiveMessages(request) : [];
  }

  public sendMessage(operation: QueueSendMessageOperation): Promise<void> {
    let queue = this.queues.get(operation.queueName);
    if (!queue) {
      queue = new LocalQueue(
        this.queueProvider.getQueue(operation.queueName)!,
        this.localConnector
      );
      this.queues.set(operation.queueName, queue);
    }
    return queue.sendMessage(operation);
  }

  public async changeMessageVisibility(
    queueName: string,
    receiptHandle: string,
    timeout: DurationSchedule
  ): Promise<void> {
    const queue = this.queues.get(queueName);
    return queue?.changeMessageVisibility(receiptHandle, timeout);
  }

  public async deleteMessage(
    queueName: string,
    receiptHandle: string
  ): Promise<void> {
    const queue = this.queues.get(queueName);
    await queue?.deleteMessage(receiptHandle);
  }

  public physicalName(queueName: string): string {
    return queueName;
  }
}

export class LocalQueue {
  constructor(
    private queue: FifoQueue | Queue,
    private localConnector: LocalEnvConnector
  ) {}

  public messages: (
    | FifoQueueHandlerMessageItem
    | StandardQueueHandlerMessageItem
  )[] = [];

  public messageVisibility: Record<string, Date> = {};

  public receiveMessages(request?: QueueRetrieveMessagesRequest) {
    const takeMessages = [];
    let i = 0;
    const visibilityTimeout =
      request?.visibilityTimeout ??
      this.queue.visibilityTimeout ??
      DEFAULT_QUEUE_VISIBILITY_TIMEOUT;

    // if we saw a message group ID, track if it was taken or not.
    const messageGroupTaken: Record<string, boolean> = {};

    // based on AWS logic, fifo queue can request 10 and non-fifo can request 1000
    const maxMessages = request?.maxMessages ?? this.queue.fifo ? 10 : 1000;

    // when any messages received will be visible
    const visibilityTime = computeScheduleDate(
      visibilityTimeout,
      this.localConnector.getTime()
    );

    while (takeMessages.length < maxMessages && i < this.messages.length) {
      const message = this.messages[i++]!;
      const messageVisibility = this.messageVisibility[message.receiptHandle];

      // grab the message group id
      const messageGroupId: string | undefined =
        (message as FifoQueueHandlerMessageItem).messageGroupId ?? undefined;

      // we'll take from this message group ID if we have not already rejected one.
      const messageGroupValid = messageGroupId
        ? messageGroupTaken[messageGroupId] ?? true
        : true;

      if (messageGroupValid) {
        if (
          !messageVisibility ||
          messageVisibility < this.localConnector.getTime()
        ) {
          message.receiveCount += 1;
          this.messageVisibility[message.id] = visibilityTime;
          if (messageGroupId) {
            messageGroupTaken[messageGroupId] = true;
          }
          takeMessages.push(message);
        } else {
          if (messageGroupId) {
            messageGroupTaken[messageGroupId] = false;
          }
        }
      }
    }

    if (takeMessages) {
      // if any messages were received, set an event to poll against for events.
      this.localConnector.scheduleEvent(visibilityTime, {
        kind: "QueuePollEvent",
        queueName: this.queue.name,
      });
    }

    return takeMessages;
  }

  public async sendMessage(
    operation: QueueSendMessageOperation
  ): Promise<void> {
    const id = ulid();
    this.messages.push({
      id,
      receiptHandle: id,
      sequenceNumber: id,
      message: operation.message,
      messageDeduplicationId: operation.fifo
        ? operation.messageDeduplicationId
        : (undefined as any),
      messageGroupId: operation.fifo
        ? operation.messageDeduplicationId
        : (undefined as any),
      sent: this.localConnector.getTime(),
      receiveCount: 0,
    });

    const delay = operation.delay ?? this.queue.delay;

    if (delay) {
      const visibilityTime = computeScheduleDate(delay, operation.message);
      this.messageVisibility[operation.message.id] = visibilityTime;
      // trigger an event to poll this queue for events on the queue when this message is planned to be visible.
      this.localConnector.scheduleEvent(visibilityTime, {
        kind: "QueuePollEvent",
        queueName: this.queue.name,
      });
    } else {
      // trigger an event to poll this queue for events on the queue.
      this.localConnector.pushWorkflowTask({
        kind: "QueuePollEvent",
        queueName: this.queue.name,
      });
    }
  }

  public async changeMessageVisibility(
    receiptHandle: string,
    timeout: DurationSchedule
  ): Promise<void> {
    this.messageVisibility[receiptHandle] = computeScheduleDate(
      timeout,
      this.localConnector.getTime()
    );
  }

  public async deleteMessage(receiptHandle: string): Promise<void> {
    const indexOf = this.messages.findIndex(
      (m) => m.receiptHandle === receiptHandle
    );
    this.messages.splice(indexOf, 1);
    delete this.messageVisibility[receiptHandle];
  }
}
