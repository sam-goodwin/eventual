import { z } from "zod";
import { CallKind, createCall, type QueueCall } from "../internal/calls.js";
import { registerEventualResource } from "../internal/resources.js";
import {
  isSourceLocation,
  type QueueHandlerOptions,
  type QueueHandlerSpec,
  type QueueSpec,
  type SourceLocation,
} from "../internal/service-spec.js";
import type { DurationSchedule } from "../schedule.js";
import type { ServiceContext } from "../service.js";

export interface QueueHandlerContext {
  /**
   * Information about the queue.
   */
  queue: {
    queueName: string;
    fifo: boolean;
  };
  /**
   * Information about the queue handler.
   */
  queueHandler: {
    queueHandlerName: string;
    batch: boolean;
  };
  /**
   * Information about the containing service.
   */
  service: ServiceContext;
}

export interface QueueHandlerMessageItem<Message = any> {
  id: string;
  receiptHandle: string;
  message: Message;
  sent: Date;
  receiveCount: number;
}

export interface QueueHandlerFunction<Message = any> {
  /**
   * Provides the keys, new value
   */
  (item: QueueHandlerMessageItem<Message>, context: QueueHandlerContext):
    | Promise<void | false>
    | void
    | false;
}

export interface QueueBatchHandlerFunction<Message = any> {
  /**
   * Provides the keys, new value
   */
  (items: QueueHandlerMessageItem<Message>[], context: QueueHandlerContext):
    | Promise<void | { failedMessageIds?: string[] }>
    | void
    | { failedMessageIds?: string[] };
}

export interface QueueHandler<Name extends string = string, Message = any>
  extends QueueHandlerSpec<Name> {
  kind: "QueueHandler";
  handler: QueueHandlerFunction<Message>;
  sourceLocation?: SourceLocation;
}

export interface QueueBatchHandler<Name extends string = string, Message = any>
  extends QueueHandlerSpec<Name> {
  kind: "QueueBatchHandler";
  handler: QueueBatchHandlerFunction<Message>;
  sourceLocation?: SourceLocation;
}

export interface SendOptions {
  delay?: DurationSchedule;
}

/**
 * TODO: support send and delete batch
 */
export interface Queue<Name extends string = string, Message = any>
  extends Omit<QueueSpec<Name>, "handler" | "message"> {
  kind: "Queue";
  handlers: (QueueHandler<any, Message> | QueueBatchHandler<any, Message>)[];
  message?: z.Schema<Message>;
  sendMessage(message: Message, options?: SendOptions): Promise<void>;
  changeMessageVisibility(
    receiptHandle: string,
    timeout: DurationSchedule
  ): Promise<void>;
  deleteMessage(receiptHandle: string): Promise<void>;
  forEach<Name extends string = string>(
    name: Name,
    handler: QueueHandlerFunction<Message>
  ): QueueHandler<Name, Message>;
  forEach<Name extends string = string>(
    name: Name,
    options: QueueHandlerOptions,
    handler: QueueHandlerFunction<Message>
  ): QueueHandler<Name, Message>;
  forEachBatch<Name extends string = string>(
    name: Name,
    handler: QueueBatchHandlerFunction<Message>
  ): QueueBatchHandler<Name, Message>;
  forEachBatch<Name extends string = string>(
    name: Name,
    options: QueueHandlerOptions,
    handler: QueueBatchHandlerFunction<Message>
  ): QueueBatchHandler<Name, Message>;
}

export interface QueueOptions<Message = any> {
  message?: z.Schema<Message>;
}

export function queue<Name extends string = string, Message = any>(
  name: Name,
  options?: QueueOptions<Message>
): Queue<Name, Message> {
  const handlers: (
    | QueueHandler<any, Message>
    | QueueBatchHandler<any, Message>
  )[] = [];

  const queue: Queue<Name, Message> = {
    kind: "Queue",
    handlers,
    name,
    message: options?.message,
    sendMessage(...args) {
      return getEventualHook().executeEventualCall(
        createCall<QueueCall>(CallKind.QueueCall, {
          queueName: name,
          operation: "sendMessage",
          params: args,
        })
      );
    },
    changeMessageVisibility(...args) {
      return getEventualHook().executeEventualCall(
        createCall<QueueCall>(CallKind.QueueCall, {
          queueName: name,
          operation: "changeMessageVisibility",
          params: args,
        })
      );
    },
    deleteMessage(...args) {
      return getEventualHook().executeEventualCall(
        createCall<QueueCall>(CallKind.QueueCall, {
          queueName: name,
          operation: "deleteMessage",
          params: args,
        })
      );
    },
    forEach<Name extends string = string>(
      ...args:
        | [name: Name, handler: QueueHandlerFunction<Message>]
        | [
            name: Name,
            options: QueueHandlerOptions,
            handler: QueueHandlerFunction<Message>
          ]
        | [
            sourceLocation: SourceLocation,
            name: Name,
            handler: QueueHandlerFunction<Message>
          ]
        | [
            sourceLocation: SourceLocation,
            name: Name,
            options: QueueHandlerOptions,
            handler: QueueHandlerFunction<Message>
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
                handler: QueueHandlerFunction<Message>
              ]),
            ];

      if (handlers.some((h) => h.name === handlerName)) {
        throw new Error(
          `Queue Handler with name ${handlerName} already exists on queue ${name}`
        );
      }

      const handler: QueueHandler<Name, Message> = {
        handler: _handler,
        kind: "QueueHandler",
        name: handlerName,
        sourceLocation,
        options,
        queueName: name,
      };

      handlers.push(handler as any);

      return handler;
    },
    forEachBatch: (
      ...args:
        | [name: Name, handler: QueueBatchHandlerFunction<Message>]
        | [
            name: Name,
            options: QueueHandlerOptions,
            handler: QueueBatchHandlerFunction<Message>
          ]
        | [
            sourceLocation: SourceLocation,
            name: Name,
            handler: QueueBatchHandlerFunction<Message>
          ]
        | [
            sourceLocation: SourceLocation,
            name: Name,
            options: QueueHandlerOptions,
            handler: QueueBatchHandlerFunction<Message>
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
                handler: QueueBatchHandlerFunction<Message>
              ]),
            ];

      if (handlers.some((h) => h.name === handlerName)) {
        throw new Error(
          `Queue Handler with name ${handlerName} already exists on queue ${name}`
        );
      }

      const handler: QueueBatchHandler<Name, Message> = {
        handler: _handler,
        kind: "QueueBatchHandler",
        name: handlerName,
        sourceLocation,
        options,
        queueName: name,
      };

      handlers.push(handler as any);

      return handler;
    },
  };

  return registerEventualResource("Queue", queue);
}
