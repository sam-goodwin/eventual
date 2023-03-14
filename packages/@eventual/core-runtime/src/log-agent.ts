import { LogLevel, LOG_LEVELS } from "@eventual/core";
import { assertNever } from "@eventual/core/internal";
import { LogsClient } from "./clients/logs-client.js";
import { getLazy, groupBy, LazyValue } from "./utils.js";

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
  private sendingLogsEnabled: boolean;
  private logLevelIndex: number;

  constructor(private props: LogAgentProps) {
    this.sendingLogsEnabled = props.sendingLogsEnabled ?? true;
    this.logFormatter = props.logFormatter ?? new DefaultLogFormatter();
    this.getTime = props.getTime ?? (() => new Date());
    this.logLevelIndex = LOG_LEVELS.indexOf(getLazy(props.logLevel.default));
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
    if (this.sendingLogsEnabled) {
      const logsToSend = this.logs.splice(0);

      const executions = groupBy(logsToSend, (l) => l.context.executionId);

      console.log(
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
