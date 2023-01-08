export interface LogEntry {
  time: number;
  message: string;
}

export interface LogsClient {
  putExecutionLogs(
    executionId: string,
    ...logEntries: LogEntry[]
  ): Promise<void>;
  initializeExecutionLog(executionId: string): Promise<void>;
}
