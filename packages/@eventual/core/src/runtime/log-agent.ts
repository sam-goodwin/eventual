import { assertNever } from "../util.js";
import {
  hookConsole,
  groupBy,
  LogsClient,
  restoreConsole,
  isConsoleHooked,
} from "./index.js";

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

export type LogLevel = "INFO" | "DEBUG" | "ERROR" | "WARN" | "TRACE";

export interface LogAgentProps {
  logClient: LogsClient;
  logFormatter?: LogFormatter;
  getTime?: () => Date;
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

  constructor(private props: LogAgentProps) {
    this.logFormatter = props.logFormatter ?? new DefaultLogFormatter();
    this.getTime = props.getTime ?? (() => new Date());
  }

  public clear() {
    this.contextStack = [];
    restoreConsole();
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
    this.logsSeenCount++;
    this.logs.push({
      context,
      level: logLevel,
      data,
      time: this.getTime().getTime(),
    });
  }

  public async flush() {
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
        return this.props.logClient.putExecutionLogs(
          execution,
          ...entries.map((e) => ({
            time: e.time,
            message: this.logFormatter.format(
              e.context,
              e.level,
              e.data,
              e.time
            ),
          }))
        );
      })
    );

    if (results.some((r) => r.status === "rejected")) {
      throw new Error("Logs failed to send");
    }
  }

  /**
   * Sets the log context for the duration of the provided handler.
   */
  public logContextScope<T>(context: LogContext, scopeHandler: () => T): T {
    try {
      this.pushContext(context);
      return scopeHandler();
    } finally {
      this.popContext();
    }
  }
}

export interface LogFormatter {
  format(
    context: LogContext,
    logLevel: LogLevel,
    data: any[],
    time: number
  ): string;
}

export class DefaultLogFormatter implements LogFormatter {
  public format(
    context: LogContext,
    logLevel: LogLevel,
    data: any[],
    time: number
  ): string {
    if (isExecutionLogContext(context)) {
      return `${new Date(time).toISOString()}\t${logLevel}\t${data.join(" ")}`;
    } else if (isActivityLogContext(context)) {
      return `${new Date(time).toISOString()}${logLevel}\t${
        context.activityName
      }:${context.seq}\t${data.join(" ")}`;
    }
    return assertNever(context);
  }
}
