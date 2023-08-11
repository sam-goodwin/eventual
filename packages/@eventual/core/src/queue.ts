import { CallKind, createCall, type QueueCall } from "./internal/calls.js";
import { registerEventualResource } from "./internal/resources.js";
import type {
  QueueHandlerSpec,
  QueueSpec,
  SourceLocation,
} from "./internal/service-spec.js";
import type { DurationSchedule } from "./schedule.js";
import type { ServiceContext } from "./service.js";

/**
 * Context passed to the handler.
 */
export interface QueueHandlerContext {
  /**
   * Information about the queue.
   */
  queue: {
    queueName: string;
    fifo: boolean;
  };
  /**
   * Information about the containing service.
   */
  service: ServiceContext;
}

export interface FifoQueueHandlerMessageItem<Message = any>
  extends QueueHandlerMessageItem<Message> {
  messageGroupId: string;
  sequenceNumber: string;
  messageDeduplicationId: string;
}

export interface QueueHandlerMessageItem<Message = any> {
  id: string;
  receiptHandle: string;
  message: Message;
  sent: Date;
  receiveCount: number;
}

export interface StandardQueueBatchHandlerFunction<
  Message = any,
  MessageItem extends QueueHandlerMessageItem<Message> = QueueHandlerMessageItem<Message>
> {
  /**
   * Provides the keys, new value
   */
  (items: MessageItem[], context: QueueHandlerContext):
    | Promise<void | { failedMessageIds?: string[] }>
    | void
    | { failedMessageIds?: string[] };
}

export type QueueBatchHandlerFunction<Message> =
  | FifoQueueBatchHandlerFunction<Message>
  | StandardQueueBatchHandlerFunction<Message>;

export type FifoQueueBatchHandlerFunction<Message = any> =
  StandardQueueBatchHandlerFunction<
    Message,
    FifoQueueHandlerMessageItem<Message>
  >;

export type QueueBatchHandler<Handler extends QueueBatchHandlerFunction<any>> =
  QueueHandlerSpec & {
    handler: Handler;
  };

export interface StandardQueueSendMessageOptions {
  delay?: DurationSchedule;
}

export type QueueSendMessageOptions =
  | FifoQueueSendMessageOptions
  | StandardQueueSendMessageOptions;

export interface FifoQueueSendMessageOptions
  extends StandardQueueSendMessageOptions {
  group?: string;
  dedupeId?: string;
}

interface QueueBase<Name extends string = string>
  extends Omit<QueueSpec<Name>, "handler" | "message"> {
  kind: "Queue";
  fifo: boolean;
  changeMessageVisibility(
    receiptHandle: string,
    timeout: DurationSchedule
  ): Promise<void>;
  deleteMessage(receiptHandle: string): Promise<void>;
}

export interface StandardQueue<Name extends string = string, Message = any>
  extends QueueBase<Name> {
  fifo: false;
  handler: QueueBatchHandler<StandardQueueBatchHandlerFunction<Message>>;
  sendMessage(
    message: Message,
    options?: StandardQueueSendMessageOptions
  ): Promise<void>;
}

export interface FifoQueue<Name extends string = string, Message = any>
  extends QueueBase<Name> {
  fifo: true;
  handler: QueueBatchHandler<FifoQueueBatchHandlerFunction<Message>>;
  groupBy?: FifoQueueMessagePropertyReference<Message>;
  dedupe?:
    | FifoQueueMessagePropertyReference<Message>
    | FifoContentBasedDeduplication;
  sendMessage(
    message: Message,
    options?: FifoQueueSendMessageOptions
  ): Promise<void>;
}

export function isFifoQueue(queue: Queue): queue is FifoQueue {
  return queue.fifo;
}

export type Queue<Name extends string = string, Message = any> =
  | FifoQueue<Name, Message>
  | StandardQueue<Name, Message>;

export type MessageIdField<Message> = {
  [K in keyof Message]: K extends string
    ? // only include attributes that extend string or number
      Message[K] extends string
      ? K
      : never
    : never;
}[keyof Message];

export type FifoQueueMessagePropertyReference<Message> =
  | MessageIdField<Message>
  | ((message: Message) => string);

interface QueueOptionsBase {
  /**
   * The default visibility timeout for messages in the queue.
   *
   * @default Schedule.duration(30, "seconds")
   */
  visibilityTimeout?: DurationSchedule;
  fifo?: boolean;
  handlerOptions?: QueueHandlerSpec;
}

export type QueueOptions<Message> =
  | FifoQueueOptions<Message>
  | (QueueOptionsBase & { fifo: false });

export interface FifoQueueOptions<Message> extends QueueOptionsBase {
  fifo: true;
  groupBy?: FifoQueueMessagePropertyReference<Message>;
  dedupe?:
    | FifoQueueMessagePropertyReference<Message>
    | FifoContentBasedDeduplication;
}

export function queue<Message, Name extends string = string>(
  ...args: [
    name: Name,
    options: QueueOptions<Message>,
    handler: QueueBatchHandlerFunction<Message>
  ]
): Queue<Name, Message> {
  const _args = args as
    | [
        name: Name,
        options: QueueOptions<Message>,
        handler: QueueBatchHandlerFunction<Message>
      ]
    | [
        sourceLocation: SourceLocation,
        name: Name,
        options: QueueOptions<Message>,
        handler: QueueBatchHandlerFunction<Message>
      ];

  const [sourceLocation, name, options, handler] =
    _args.length === 4 ? _args : [undefined, ..._args];

  const { fifo, handlerOptions, visibilityTimeout } = options;

  const queueBase = {
    kind: "Queue",
    name,
    fifo,
    visibilityTimeout,
    changeMessageVisibility(...args) {
      return getEventualHook().executeEventualCall(
        createCall<QueueCall>(CallKind.QueueCall, {
          operation: {
            queueName: name,
            operation: "changeMessageVisibility",
            params: args,
          },
        })
      );
    },
    deleteMessage(...args) {
      return getEventualHook().executeEventualCall(
        createCall<QueueCall>(CallKind.QueueCall, {
          operation: {
            queueName: name,
            operation: "deleteMessage",
            params: args,
          },
        })
      );
    },
  } satisfies Partial<Queue<Name, Message>>;

  const queue: Queue<Name, Message> = fifo
    ? <FifoQueue<Name, Message>>{
        ...queueBase,
        handler: {
          ...handlerOptions,
          sourceLocation,
          handler,
        },
        fifo,
        contentBasedDeduplication: isFifoContentBasedDeduplication(
          options.dedupe
        ),
        groupBy: options.groupBy,
        dedupe: options.dedupe,
        sendMessage(
          message: Message,
          sendOptions?: FifoQueueSendMessageOptions
        ) {
          const messageGroupIdReference = options?.groupBy;
          const messageDedupeIdReference = options?.dedupe;

          const messageGroupId =
            (sendOptions as FifoQueueSendMessageOptions).group ??
            messageGroupIdReference
              ? typeof messageGroupIdReference === "string"
                ? message[messageGroupIdReference]
                : messageGroupIdReference?.(message)
              : undefined;
          if (!messageGroupId || typeof messageGroupId !== "string") {
            throw new Error(
              "Message Group Id must be provided and must be a non-empty string"
            );
          }

          const messageDeduplicationId =
            (sendOptions as FifoQueueSendMessageOptions).dedupeId ??
            messageDedupeIdReference
              ? typeof messageDedupeIdReference === "string"
                ? message[messageDedupeIdReference]
                : typeof messageDedupeIdReference === "function"
                ? messageDedupeIdReference?.(message)
                : messageDedupeIdReference
              : undefined;
          if (
            !messageDeduplicationId ||
            !(
              typeof messageDeduplicationId === "string" ||
              isFifoContentBasedDeduplication(messageDeduplicationId)
            )
          ) {
            throw new Error(
              "Message Deduplication Id must be provided and a non-empty string or set to { contentBasedDeduplication: true }"
            );
          }

          return getEventualHook().executeEventualCall(
            createCall<QueueCall>(CallKind.QueueCall, {
              operation: {
                queueName: name,
                operation: "sendMessage",
                fifo,
                messageGroupId,
                messageDeduplicationId,
                message,
                delay: sendOptions?.delay,
              },
            })
          );
        },
      }
    : <StandardQueue<Name, Message>>{
        ...queueBase,
        handler: {
          ...handlerOptions,
          sourceLocation,
          handler,
        },
        fifo,
        sendMessage(
          message: Message,
          sendOptions?: StandardQueueSendMessageOptions
        ) {
          return getEventualHook().executeEventualCall(
            createCall<QueueCall>(CallKind.QueueCall, {
              operation: {
                queueName: name,
                operation: "sendMessage",
                fifo: false,
                delay: sendOptions?.delay,
                message,
              },
            })
          );
        },
      };

  return registerEventualResource("Queue", queue as Queue<Name, Message>);
}

/**
 * Assertion that content based deduplication is on.
 *
 * Can be overridden when calling `sendMessage`.
 */
export interface FifoContentBasedDeduplication {
  contentBasedDeduplication: true;
}

export function isFifoContentBasedDeduplication(
  value: any
): value is FifoContentBasedDeduplication {
  return value && typeof value === "object" && value.contentBasedDeduplication;
}
