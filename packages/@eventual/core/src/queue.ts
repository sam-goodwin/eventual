import {
  CallKind,
  createCall,
  FifoQueueSendMessagePayload,
  type QueueCall,
} from "./internal/calls.js";
import { registerEventualResource } from "./internal/resources.js";
import type {
  QueueHandlerSpec,
  QueueSpec,
  SourceLocation,
} from "./internal/service-spec.js";
import { DurationSchedule, Schedule } from "./schedule.js";
import type { ServiceContext } from "./service.js";

export const DEFAULT_QUEUE_VISIBILITY_TIMEOUT = Schedule.duration(30);

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
  extends StandardQueueHandlerMessageItem<Message> {
  messageGroupId: string;
  sequenceNumber: string;
  messageDeduplicationId: string;
}

export interface StandardQueueHandlerMessageItem<Message = any> {
  id: string;
  receiptHandle: string;
  message: Message;
  sent: Date;
  receiveCount: number;
}

export interface QueueBatchHandlerFunctionBase<
  Message = any,
  MessageItem extends StandardQueueHandlerMessageItem<Message> = StandardQueueHandlerMessageItem<Message>
> {
  /**
   * Provides the keys, new value
   */
  (items: MessageItem[], context: QueueHandlerContext):
    | Promise<void | { failedMessageIds?: string[] }>
    | void
    | { failedMessageIds?: string[] };
}

export type QueueBatchHandlerFunction<
  Message,
  Fifo extends boolean | undefined
> = Fifo extends true
  ? FifoQueueBatchHandlerFunction<Message>
  : StandardQueueBatchHandlerFunction<Message>;

export type StandardQueueBatchHandlerFunction<Message = any> =
  QueueBatchHandlerFunctionBase<
    Message,
    StandardQueueHandlerMessageItem<Message>
  >;

export type FifoQueueBatchHandlerFunction<Message = any> =
  QueueBatchHandlerFunctionBase<Message, FifoQueueHandlerMessageItem<Message>>;

export type QueueBatchHandler<
  Handler extends QueueBatchHandlerFunction<any, any>
> = QueueHandlerSpec & {
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

export interface QueueSendMessageBatchEntry<
  Message,
  Options extends StandardQueueSendMessageOptions = StandardQueueSendMessageOptions
> {
  /**
   * ID of the message. Will be returned if the message fails to send.
   */
  id: string;
  message: Message;
  options?: Options;
}

export interface QueueBatchResponse {
  failed?: { id: string; message?: string }[];
}

export interface QueueDeleteBatchEntry {
  id: string;
  receiptHandle: string;
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
  deleteMessageBatch(
    entries: QueueDeleteBatchEntry[]
  ): Promise<QueueBatchResponse>;
}

export interface StandardQueue<Name extends string = string, Message = any>
  extends QueueBase<Name> {
  fifo: false;
  handler: QueueBatchHandler<StandardQueueBatchHandlerFunction<Message>>;
  sendMessage(
    message: Message,
    options?: StandardQueueSendMessageOptions
  ): Promise<void>;
  sendMessageBatch(
    entries: QueueSendMessageBatchEntry<Message>[]
  ): Promise<QueueBatchResponse>;
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
  sendMessageBatch(
    entries: QueueSendMessageBatchEntry<Message, FifoQueueSendMessageOptions>[]
  ): Promise<QueueBatchResponse>;
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

interface QueueOptionsBase<Fifo extends boolean> {
  /**
   * Amount of time to delay the delivery of messages in the queue to consumers.
   *
   * @default 0 seconds
   */
  delay?: DurationSchedule;
  /**
   * When true, the contents of the messages are encrypted server side with a managed key.
   *
   * @default true
   */
  encryption?: boolean;
  fifo?: Fifo;
  handlerOptions?: QueueHandlerSpec;
  /**
   * The default visibility timeout for messages in the queue.
   *
   * @default Schedule.duration(30, "seconds")
   */
  visibilityTimeout?: DurationSchedule;
}

export type QueueOptions<Message> =
  | FifoQueueOptions<Message>
  | QueueOptionsBase<false>;

export interface FifoQueueOptions<Message> extends QueueOptionsBase<true> {
  fifo: true;
  groupBy?: FifoQueueMessagePropertyReference<Message>;
  dedupe?:
    | FifoQueueMessagePropertyReference<Message>
    | FifoContentBasedDeduplication;
}

export function queue<Message, Name extends string = string>(
  ...args: [
    name: Name,
    options: FifoQueueOptions<Message>,
    handler: FifoQueueBatchHandlerFunction<Message>
  ]
): FifoQueue<Name, Message>;
export function queue<Message, Name extends string = string>(
  ...args: [
    name: Name,
    options: QueueOptions<Message>,
    handler: StandardQueueBatchHandlerFunction<Message>
  ]
): StandardQueue<Name, Message>;
export function queue<
  Message,
  Name extends string = string,
  Fifo extends boolean | undefined = undefined
>(
  ...args: [
    name: Name,
    options: QueueOptions<Message>,
    handler: QueueBatchHandlerFunction<Message, Fifo>
  ]
): Queue<Name, Message> {
  const _args = args as
    | [
        name: Name,
        options: QueueOptions<Message>,
        handler: QueueBatchHandlerFunction<Message, Fifo>
      ]
    | [
        sourceLocation: SourceLocation,
        name: Name,
        options: QueueOptions<Message>,
        handler: QueueBatchHandlerFunction<Message, Fifo>
      ];

  const [sourceLocation, name, options, handler] =
    _args.length === 4 ? _args : [undefined, ..._args];

  const { fifo, handlerOptions, visibilityTimeout, delay, encryption } =
    options;

  const queueBase = {
    kind: "Queue",
    name,
    delay,
    encryption: encryption ?? true,
    fifo,
    visibilityTimeout,
    changeMessageVisibility(...args) {
      return getEventualHook().executeEventualCall(
        createCall<QueueCall<"changeMessageVisibility">>(CallKind.QueueCall, {
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
        createCall<QueueCall<"deleteMessage">>(CallKind.QueueCall, {
          operation: {
            queueName: name,
            operation: "deleteMessage",
            params: args,
          },
        })
      );
    },
    deleteMessageBatch(...args) {
      return getEventualHook().executeEventualCall(
        createCall<QueueCall<"deleteMessageBatch">>(CallKind.QueueCall, {
          operation: {
            queueName: name,
            operation: "deleteMessageBatch",
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
          return getEventualHook().executeEventualCall(
            createCall<QueueCall>(CallKind.QueueCall, {
              operation: {
                queueName: name,
                operation: "sendMessage",
                fifo,
                ...processFifoSendMessageMessage(message, options, sendOptions),
              },
            })
          );
        },
        sendMessageBatch(
          entries: QueueSendMessageBatchEntry<
            Message,
            FifoQueueSendMessageOptions
          >[]
        ) {
          const processMessages = entries.map((m) => ({
            id: m.id,
            ...processFifoSendMessageMessage(m.message, options, m.options),
          }));

          return getEventualHook().executeEventualCall(
            createCall<QueueCall<"sendMessageBatch">>(CallKind.QueueCall, {
              operation: {
                queueName: name,
                operation: "sendMessageBatch",
                fifo,
                entries: processMessages,
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
        sendMessageBatch(messages) {
          return getEventualHook().executeEventualCall(
            createCall<QueueCall<"sendMessageBatch">>(CallKind.QueueCall, {
              operation: {
                queueName: name,
                operation: "sendMessageBatch",
                fifo: false,
                entries: messages.map((m) => ({
                  id: m.id,
                  message: m.message,
                  delay: m.options?.delay,
                })),
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

function processFifoSendMessageMessage(
  message: any,
  options: FifoQueueOptions<any>,
  sendOptions?: FifoQueueSendMessageOptions
): FifoQueueSendMessagePayload {
  const messageGroupIdReference = options?.groupBy;
  const messageDedupeIdReference = options?.dedupe;

  const messageGroupId =
    sendOptions?.group ?? messageGroupIdReference
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
    sendOptions?.dedupeId ?? messageDedupeIdReference
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

  return {
    messageGroupId,
    messageDeduplicationId,
    message,
    delay: sendOptions?.delay,
  };
}
