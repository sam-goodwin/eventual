import { LogEntry, LogsClient } from "@eventual/core";

export class TestLogsClient implements LogsClient {
  public async putExecutionLogs(
    executionId: string,
    ...logEntries: LogEntry[]
  ): Promise<void> {
    logEntries.forEach((l) => {
      console.log(
        `${new Date(l.time).toISOString()}: (${executionId}) ${l.message}`
      );
    });
  }

  // nothing to do.
  public initializeExecutionLog(_executionId: string): Promise<void> {
    return Promise.resolve();
  }
}
