import { assertNever } from "../util.js";
import { LogsClient } from "./clients/logs-client.js";
import {
  hookConsole,
  isConsoleHooked,
  restoreConsole,
} from "./console-hook.js";
import { groupBy } from "./utils.js";

export type LogContext = ExecutionLogContext | ActivityLogContext;

export enum LogContextType {
  Activity = 0,
  Execution = 1,
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

export enum LogLevel {
  TRACE = "TRACE",
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}
export const LOG_LEVELS = Object.values(LogLevel);

export interface LogAgentProps {
  logsClient: LogsClient;
  logFormatter?: LogFormatter;
  getTime?: () => Date;
  /**
   * When false, logs are buffered.
   *
   * @default true
   */
  sendingLogsEnabled?: boolean;
  logLevel: {
    default: LogLevel;
  };
}

export interface Checkpoint {
  lastLogEntry?: LogEntry;
}

interface LogEntry {
  context: LogContext;
  level: LogLevel;
  data: any[];
  time: number;
}

export class LogAgent {
  private contextStack: LogContext[] = [];
  private readonly logs: {
    context: LogContext;
    level: LogLevel;
    data: any[];
    time: number;
  }[] = [];

  private readonly logFormatter: LogFormatter;
  private readonly getTime: () => Date;
  public logsSeenCount = 0;
  private sendingLogsEnabled: boolean;
  private logLevelIndex: number;

  constructor(private props: LogAgentProps) {
    this.sendingLogsEnabled = props.sendingLogsEnabled ?? true;
    this.logFormatter = props.logFormatter ?? new DefaultLogFormatter();
    this.getTime = props.getTime ?? (() => new Date());
    this.logLevelIndex = LOG_LEVELS.indexOf(props.logLevel.default);
  }

  /**
   * Enable the sending of logs (based on configuration or flush).
   */
  public enableSendingLogs() {
    this.sendingLogsEnabled = true;
  }

  /**
   * Disable the sending of logs (based on configuration or flush).
   */
  public disableSendingLogs() {
    this.sendingLogsEnabled = false;
  }

  public clearContext() {
    this.contextStack = [];
    restoreConsole();
  }

  /**
   * Clear all buffered logs.
   *
   * @param checkpoint - if provided, clears log up to and not including the checkpoint position.
   */
  public clearLogs(checkpoint?: Checkpoint) {
    const clearIndex = checkpoint?.lastLogEntry
      ? this.logs.findIndex((l) => l === checkpoint.lastLogEntry) ?? -1
      : -1;

    this.logs.splice(clearIndex + 1);
  }

  /**
   * Retrieve a pointer to the newest log item. Used to clear only to this point.
   */
  public getCheckpoint(): Checkpoint {
    return {
      lastLogEntry:
        this.logs.length > 0 ? this.logs[this.logs.length - 1] : undefined,
    };
  }

  public pushContext(context: LogContext) {
    this.contextStack.push(context);
    if (!isConsoleHooked()) {
      hookConsole((level, ...data) => {
        if (this.contextStack.length > 0) {
          this.log(level, ...data);
          return undefined;
        } else {
          // if there is no context set, let the console log like normal
          return data;
        }
      });
    }
  }

  public popContext(): LogContext {
    const context = this.contextStack.pop();
    if (!context) {
      throw new Error("No contexts to pop");
    }
    if (this.contextStack.length === 0) {
      restoreConsole();
    }
    return context;
  }

  public log(logLevel: LogLevel, ...data: any[]) {
    const context = this.contextStack[this.contextStack.length - 1];
    if (!context) {
      throw new Error(
        "A Log Context has not been set yet. Call LogAgent.pushContext or use LogAgent.logWithContext."
      );
    }
    this.logWithContext(context, logLevel, ...data);
  }

  public logWithContext(
    context: LogContext,
    logLevel: LogLevel,
    ...data: any[]
  ) {
    if (this.isLogLevelSatisfied(logLevel)) {
      this.logsSeenCount++;
      this.logs.push({
        context,
        level: logLevel,
        data,
        time: this.getTime().getTime(),
      });
    }
  }

  private isLogLevelSatisfied(entry: LogLevel): boolean {
    return LOG_LEVELS.indexOf(entry) >= this.logLevelIndex;
  }

  public async flush() {
    if (this.sendingLogsEnabled) {
      const logsToSend = this.logs.splice(0);

      const executions = groupBy(logsToSend, (l) => l.context.executionId);

      console.log(
        `Sending ${logsToSend.length} logs for ${
          Object.keys(executions).length
        } executions`
      );

      // TODO retry
      const results = await Promise.allSettled(
        Object.entries(executions).map(([execution, entries]) => {
          return this.props.logsClient.putExecutionLogs(
            execution,
            ...entries.map((e) => ({
              time: e.time,
              message: this.logFormatter.format(e),
            }))
          );
        })
      );

      if (results.some((r) => r.status === "rejected")) {
        throw new Error("Logs failed to send");
      }
    }
  }

  /**
   * Sets the log context for the duration of the provided handler.
   */
  public async logContextScope<T>(
    context: LogContext,
    scopeHandler: () => T
  ): Promise<T> {
    try {
      this.pushContext(context);
      return await scopeHandler();
    } finally {
      this.popContext();
    }
  }

  /**
   * Sets the log context for the duration of the provided handler.
   */
  public logContextScopeSync<T>(context: LogContext, scopeHandler: () => T): T {
    try {
      this.pushContext(context);
      return scopeHandler();
    } finally {
      this.popContext();
    }
  }
}

export interface LogFormatter {
  format(entry: LogEntry): string;
}

export class DefaultLogFormatter implements LogFormatter {
  public format(entry: LogEntry): string {
    if (isExecutionLogContext(entry.context)) {
      return `${entry.level}\t${entry.data.join(" ")}`;
    } else if (isActivityLogContext(entry.context)) {
      return `${entry.level}\t${entry.context.activityName}:${
        entry.context.seq
      }\t${entry.data.join(" ")}`;
    }
    return assertNever(entry.context);
  }
}
