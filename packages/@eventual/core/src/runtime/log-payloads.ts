export type LogContext =
  | ExecutionLogContext
  | ActivityLogContext
  | ApiHandlerLogContext
  | EventHandlerLogContext;

export enum LogContextType {
  Activity = 0,
  ApiHandler = 1,
  EventHandler = 2,
  Execution = 3,
}

export interface ExecutionLogContext {
  type: LogContextType.Execution;
  executionId: string;
}

export function isExecutionLogContext(
  context: LogContext
): context is ExecutionLogContext {
  return context.type === LogContextType.Execution;
}

export interface ActivityLogContext {
  type: LogContextType.Activity;
  executionId: string;
  seq: number;
  activityName: string;
}

export function isActivityLogContext(
  context: LogContext
): context is ActivityLogContext {
  return context.type === LogContextType.Activity;
}

export interface ApiHandlerLogContext {
  type: LogContextType.ApiHandler;
  path: string;
}

export function isApiHandlerLogContext(
  context: LogContext
): context is ApiHandlerLogContext {
  return context.type === LogContextType.ApiHandler;
}

export interface EventHandlerLogContext {
  type: LogContextType.EventHandler;
  event: string;
}

export function isEventHandlerLogContext(
  context: LogContext
): context is EventHandlerLogContext {
  return context.type === LogContextType.EventHandler;
}

export const EventualLogContextPrefix = "[EVTL]";

export function serializeEventualLogContext(logContext: LogContext) {
  return `${EventualLogContextPrefix} ${JSON.stringify(logContext)}`;
}

/**
 * Expected lambda log format: [LEVEL] [EVTL] {}
 */
export function isSerializedEventualLogContext(message: string) {
  return message.split("\t")[3]?.startsWith(EventualLogContextPrefix);
}

export type LogLevel = "INFO" | "DEBUG" | "ERROR" | "WARN";

export interface EventualLog<
  Context extends LogContext | undefined = LogContext | undefined
> {
  context: Context;
  level?: LogLevel;
  message?: string;
}

export function tryParseEventualLog(message: string): EventualLog {
  if (isSerializedEventualLogContext(message)) {
    const [_, level, context, mess] =
      /.*\t(.*)\t\[EVTL\] (\{.*\}) (.*)/gs.exec(message) ?? [];

    console.log(
      "test message",
      message,
      "level",
      level,
      "context",
      context,
      "parsed message",
      mess
    );

    return {
      level: level as LogLevel,
      message: mess,
      context: context ? JSON.parse(context) : context,
    };
  } else {
    return {
      message,
      context: undefined,
    };
  }
}
