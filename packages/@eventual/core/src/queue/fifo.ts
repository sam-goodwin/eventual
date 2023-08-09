import { CallKind, createCall, type QueueCall } from "../internal/calls.js";
import { registerEventualResource } from "../internal/resources.js";
import {
  isSourceLocation,
  type QueueHandlerOptions,
  type SourceLocation,
} from "../internal/service-spec.js";
import type {
  Queue,
  QueueBatchHandler,
  QueueBatchHandlerFunction,
  QueueHandler,
  QueueHandlerFunction,
  QueueHandlerMessageItem,
  QueueOptions,
  QueueSendMessageOptions,
} from "./queue.js";

export interface FifoQueueHandlerMessageItem<Message = any>
  extends QueueHandlerMessageItem<Message> {
  messageGroupId: string;
  sequenceNumber: string;
  messageDeduplicationId: string;
}

/**
 * Assertion that content based deduplication is on.
 *
 * Can be overridden when calling `sendMessage`.
 */
export interface FifoContentBasedDeduplication {
  contentBasedDeduplication: true;
}

export type FifoQueueHandlerFunction<Message = any> = QueueHandlerFunction<
  Message,
  FifoQueueHandlerMessageItem<Message>
>;

export type FifoQueueBatchHandlerFunction<Message = any> =
  QueueBatchHandlerFunction<Message, FifoQueueHandlerMessageItem<Message>>;

export interface FifoQueueHandler<Name extends string = string, Message = any>
  extends Omit<QueueHandler<Name, Message>, "handler" | "fifo"> {
  handler: FifoQueueHandlerFunction<Message>;
  fifo: true;
}

export interface FifoQueueBatchHandler<
  Name extends string = string,
  Message = any
> extends Omit<QueueBatchHandler<Name, Message>, "handler" | "fifo"> {
  handler: FifoQueueBatchHandlerFunction<Message>;
  fifo: true;
}

export interface FifoQueueSendOptions extends QueueSendMessageOptions {
  messageGroupId?: string;
  messageDeduplicationId?: string;
}

/**
 * TODO: support send and delete batch
 */
export interface FifoQueue<Name extends string = string, Message = any>
  extends Omit<
    Queue<Name, Message>,
    "sendMessage" | "handlers" | "forEach" | "forEachBatch"
  > {
  handlers: (
    | FifoQueueHandler<any, Message>
    | FifoQueueBatchHandler<any, Message>
  )[];
  fifo: true;
  sendMessage(message: Message, options?: FifoQueueSendOptions): Promise<void>;
  forEach<Name extends string = string>(
    name: Name,
    handler: FifoQueueHandlerFunction<Message>
  ): FifoQueueHandler<Name, Message>;
  forEach<Name extends string = string>(
    name: Name,
    options: QueueHandlerOptions,
    handler: FifoQueueHandlerFunction<Message>
  ): FifoQueueHandler<Name, Message>;
  forEachBatch<Name extends string = string>(
    name: Name,
    handler: FifoQueueBatchHandlerFunction<Message>
  ): FifoQueueBatchHandler<Name, Message>;
  forEachBatch<Name extends string = string>(
    name: Name,
    options: QueueHandlerOptions,
    handler: FifoQueueBatchHandlerFunction<Message>
  ): FifoQueueBatchHandler<Name, Message>;
}

export type MessageIdField<Message = any> = {
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

export interface FifoQueueOptions<
  Message = any,
  MessageGroupId extends
    | FifoQueueMessagePropertyReference<Message>
    | undefined = FifoQueueMessagePropertyReference<Message> | undefined,
  MessageDeduplicationId extends
    | FifoQueueMessagePropertyReference<Message>
    | undefined
    | FifoContentBasedDeduplication =
    | FifoQueueMessagePropertyReference<Message>
    | undefined
    | FifoContentBasedDeduplication
> extends QueueOptions<Message> {
  /**
   * The field or function used to compute the `messageGroupId`.
   *
   * The `messageGroupId` determines how messages are grouped in the Fifo Queue.
   * Messages with the same Id will be sent to both forEach and forEachBatch handlers in the order retrieved and cannot progress until
   * the first one succeeds.
   *
   * * Field Name - provide a field to use for the `messageGroupId`. This field must be required and must contain a string value.
   * * Getter Function - provide a (synchronous) function to compute the group id from a message on send.
   * * undefined - `messageGroupId` will be required on `sendMessage`.
   *
   * Can be overridden during `sendMessage` by providing a messageGroupId there.
   *
   * @default undefined - must be set during `sendMessage`.
   */
  messageGroupId?: MessageGroupId;
  /**
   * A field or setting for content deduplication.
   *
   * * Field Name - provide a field to use for content deduplication. This field must be required and must contain a string value.
   * * Getter Function - provide a (synchronous) function to compute the deduplication id from a message on send.
   * * `CONTENT_BASED_DEDUPE` - use the content of the message to compute the deduplication id.
   *
   * Any of these setting can be overridden during send message by providing a messageDeduplicationId there.
   */
  messageDeduplicationId?: MessageDeduplicationId;
}

export function fifoQueue<Name extends string = string, Message = any>(
  name: Name,
  options?: FifoQueueOptions<Message>
): FifoQueue<Name, Message> {
  const handlers: (
    | FifoQueueHandler<any, Message>
    | FifoQueueBatchHandler<any, Message>
  )[] = [];

  const messageGroupIdReference = options?.messageGroupId;
  const messageDedupeIdReference = options?.messageDeduplicationId;

  const queue: FifoQueue<Name, Message> = {
    kind: "Queue",
    handlers,
    name,
    fifo: true,
    message: options?.message,
    sendMessage(message, sendOptions) {
      const messageGroupId =
        sendOptions?.messageGroupId ?? messageGroupIdReference
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
        sendOptions?.messageDeduplicationId ?? messageDedupeIdReference
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
          (typeof messageDeduplicationId === "object" &&
            "contentBasedDeduplication" in messageDeduplicationId)
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
            fifo: true,
            message,
            delay: sendOptions?.delay,
            messageGroupId,
            messageDeduplicationId,
          },
        })
      );
    },
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
    forEach<Name extends string = string>(
      ...args:
        | [name: Name, handler: FifoQueueHandlerFunction<Message>]
        | [
            name: Name,
            options: QueueHandlerOptions,
            handler: FifoQueueHandlerFunction<Message>
          ]
        | [
            sourceLocation: SourceLocation,
            name: Name,
            handler: FifoQueueHandlerFunction<Message>
          ]
        | [
            sourceLocation: SourceLocation,
            name: Name,
            options: QueueHandlerOptions,
            handler: FifoQueueHandlerFunction<Message>
          ]
    ) {
      const [sourceLocation, handlerName, options, _handler] =
        args.length === 4
          ? args
          : args.length === 2
          ? [, args[0] as Name, , args[1]]
          : isSourceLocation(args[0])
          ? [args[0], args[1] as Name, , args[2]]
          : [
              undefined,
              ...(args as [
                name: Name,
                options: QueueHandlerOptions,
                handler: FifoQueueHandlerFunction<Message>
              ]),
            ];

      if (handlers.some((h) => h.name === handlerName)) {
        throw new Error(
          `Queue Handler with name ${handlerName} already exists on queue ${name}`
        );
      }

      const handler: FifoQueueHandler<Name, Message> = {
        handler: _handler,
        kind: "QueueHandler",
        name: handlerName,
        sourceLocation,
        options,
        batch: false,
        fifo: true,
        queueName: name,
      };

      handlers.push(handler as any);

      return handler;
    },
    forEachBatch: (
      ...args:
        | [name: Name, handler: FifoQueueBatchHandlerFunction<Message>]
        | [
            name: Name,
            options: QueueHandlerOptions,
            handler: FifoQueueBatchHandlerFunction<Message>
          ]
        | [
            sourceLocation: SourceLocation,
            name: Name,
            handler: FifoQueueBatchHandlerFunction<Message>
          ]
        | [
            sourceLocation: SourceLocation,
            name: Name,
            options: QueueHandlerOptions,
            handler: FifoQueueBatchHandlerFunction<Message>
          ]
    ) => {
      const [sourceLocation, handlerName, options, _handler] =
        args.length === 4
          ? args
          : args.length === 2
          ? [, args[0] as Name, , args[1]]
          : isSourceLocation(args[0])
          ? [args[0], args[1] as Name, , args[2]]
          : [
              undefined,
              ...(args as [
                name: Name,
                options: QueueHandlerOptions,
                handler: FifoQueueBatchHandlerFunction<Message>
              ]),
            ];

      if (handlers.some((h) => h.name === handlerName)) {
        throw new Error(
          `Queue Handler with name ${handlerName} already exists on queue ${name}`
        );
      }

      const handler: FifoQueueBatchHandler<Name, Message> = {
        handler: _handler,
        kind: "QueueBatchHandler",
        name: handlerName,
        sourceLocation,
        options,
        batch: true,
        fifo: true,
        queueName: name,
      };

      handlers.push(handler as any);

      return handler;
    },
  };

  return registerEventualResource("Queue", queue);
}
