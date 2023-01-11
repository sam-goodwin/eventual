export interface LogEntry {
  time: number;
  message: string;
}

/**
 * A client interface which represent how Eventual should publish logs.
 */
export interface LogsClient {
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
   */
  initializeExecutionLog(executionId: string): Promise<void>;
}
