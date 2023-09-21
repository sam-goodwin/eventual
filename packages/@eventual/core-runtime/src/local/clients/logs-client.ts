import type {
  GetExecutionLogsRequest,
  GetExecutionLogsResponse,
  LogEntry,
} from "@eventual/core/internal";
import type { LogsClient } from "../../clients/logs-client.js";
import type { LocalSerializable } from "../local-persistance-store.js";
import { paginateItems } from "../stores/pagination.js";

export class LocalLogsClient implements LogsClient, LocalSerializable {
  constructor(private logEntries: Record<string, LogEntry[]> = {}) {}

  public serialize(): Record<string, Buffer> {
    return Object.fromEntries(
      Object.entries(this.logEntries).map(([name, data]) => {
        return [
          name,
          Buffer.from(
            data
              .map((d) => `${new Date(d.time).toISOString()}: ${d.message}`)
              .join("\n")
          ),
        ];
      })
    );
  }

  public static fromSerializedData(data?: Record<string, Buffer>) {
    if (!data) {
      return new LocalLogsClient();
    } else {
      const logEntries: Record<string, LogEntry[]> = Object.fromEntries(
        Object.entries(data).map(([name, value]) => [
          name,
          value
            .toString()
            .split("\n")
            .flatMap((l) => {
              const [time, ...messageParts] = l.split(":");
              if (!time) {
                return [];
              }
              return {
                time: new Date(time).getTime(),
                message: messageParts.join(":").trim(),
              };
            }),
        ])
      );
      return new LocalLogsClient(logEntries);
    }
  }

  public async getExecutionLogs(
    request: GetExecutionLogsRequest
  ): Promise<GetExecutionLogsResponse> {
    if (request.executionId && request.workflowName) {
      throw new Error(
        "One of executionId, workflowName, or neither are allowed."
      );
    }
    const items = request.executionId
      ? (this.logEntries[request.executionId] ?? []).map((e) => ({
          ...e,
          source: request.executionId,
        }))
      : Object.entries(this.logEntries)
          .filter(([name]) =>
            request.workflowName
              ? name.startsWith(`${request.workflowName}/`)
              : true
          )
          .flatMap(([name, entries]) =>
            entries.map((e) => ({ ...e, source: name }))
          );

    const result = paginateItems(
      items,
      (i) => i.time,
      undefined,
      "ASC",
      request.maxResults,
      request.nextToken
    );

    return { events: result.items, nextToken: result.nextToken };
  }

  public async putExecutionLogs(
    executionId: string,
    ...logEntries: LogEntry[]
  ): Promise<void> {
    (this.logEntries[executionId] ??= []).push(...logEntries);
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
