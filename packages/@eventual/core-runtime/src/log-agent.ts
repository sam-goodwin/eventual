import { LogLevel, LOG_LEVELS } from "@eventual/core";
import { assertNever } from "@eventual/core/internal";
import { format } from "util";
import type { LogsClient } from "./clients/logs-client.js";
import { getLazy, groupBy, LazyValue } from "./utils.js";

export type LogContext = ExecutionLogContext | TaskLogContext;

export interface ExecutionLogContext {
  executionId: string;
}

export function isExecutionLogContext(
  context: LogContext
): context is ExecutionLogContext {
  return context && !("taskName" in context);
}

export interface TaskLogContext {
  executionId: string;
  seq: number;
  taskName: string;
}

export function isTaskLogContext(
  context: LogContext
): context is TaskLogContext {
  return context && "taskName" in context;
}

export interface LogAgentProps {
  logsClient: LogsClient;
  logFormatter?: LogFormatter;
  getTime?: () => Date;
  logLevel: {
    default: LazyValue<LogLevel>;
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
  private readonly logs: LogEntry[] = [];

  private readonly logFormatter: LogFormatter;
  private readonly getTime: () => Date;
  public logsSeenCount = 0;
  private logLevelIndex: number;

  constructor(private props: LogAgentProps) {
    this.logFormatter = props.logFormatter ?? new DefaultLogFormatter();
    this.getTime = props.getTime ?? (() => new Date());
    this.logLevelIndex = LOG_LEVELS.indexOf(getLazy(props.logLevel.default));
  }

  public logWithContext(
    context: LogContext,
    logLevel: LogLevel,
    /**
     * When data is an event, it is only invoked when the log level is satisfied
     */
    data: any[] | (() => any[])
  ) {
    if (this.isLogLevelSatisfied(logLevel)) {
      this.logsSeenCount++;
      this.logs.push({
        context,
        level: logLevel,
        data: typeof data === "function" ? data() : data,
        time: this.getTime().getTime(),
      });
    }
  }

  public isLogLevelSatisfied(entry: LogLevel): boolean {
    return LOG_LEVELS.indexOf(entry) >= this.logLevelIndex;
  }

  public async flush() {
    const logsToSend = this.logs.splice(0);

    const executions = groupBy(logsToSend, (l) => l.context.executionId);

    console.debug(
      `Sending ${logsToSend.length} logs for ${
        Object.keys(executions).length
      } executions`
    );

    // TODO retry - https://github.com/functionless/eventual/issues/235
    const results = await Promise.allSettled(
      Object.entries(executions).map(([execution, entries]) => {
        return this.props.logsClient.putExecutionLogs(
          execution,
          ...entries
            .sort((a, b) => a.time - b.time)
            .map((e) => ({
              time: e.time,
              message: this.logFormatter.format(e),
            }))
        );
      })
    );

    if (results.some((r) => r.status === "rejected")) {
      throw new Error(
        "Logs failed to send: " +
          JSON.stringify(results.filter((r) => r.status === "rejected"))
      );
    }
  }
}

export interface LogFormatter {
  format(entry: LogEntry): string;
}

export class DefaultLogFormatter implements LogFormatter {
  public format(entry: LogEntry): string {
    if (isTaskLogContext(entry.context)) {
      return `${entry.level}\t${entry.context.taskName}:${
        entry.context.seq
      }\t${format(...entry.data)}`;
    } else if (isExecutionLogContext(entry.context)) {
      return `${entry.level}\t${format(...entry.data)}`;
    }
    return assertNever(entry.context);
  }
}
