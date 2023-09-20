import type {
  GetExecutionLogsRequest,
  GetExecutionLogsResponse,
  LogEntry,
} from "@eventual/core/internal";

/**
 * A client interface which represent how Eventual should publish logs.
 */
export interface LogsClient {
  getExecutionLogs(
    request: GetExecutionLogsRequest
  ): Promise<GetExecutionLogsResponse>;
  /**
   * Put one or more log entries related to an execution.
   */
  putExecutionLogs(
    executionId: string,
    ...logEntries: LogEntry[]
  ): Promise<void>;
  /**
   * Do any actions required to create the log location for an execution.
   * For example, CreateLogStream in AWS CloudWatch Logs.
   *
   * If the log group already exists, will ignore the error.
   */
  initializeExecutionLog(executionId: string): Promise<void>;
}
