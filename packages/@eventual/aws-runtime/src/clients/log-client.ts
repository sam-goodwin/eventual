import { LogEntry, LogsClient } from "@eventual/core";
import {
  CloudWatchLogsClient,
  PutLogEventsCommand,
  CreateLogStreamCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { formatWorkflowExecutionStreamName } from "../utils.js";

export interface AWSLogsClientProps {
  cloudwatchLogsClient: CloudWatchLogsClient;
  serviceLogGroup: string;
}

export class AWSLogsClient implements LogsClient {
  constructor(private props: AWSLogsClientProps) {}

  public async putExecutionLogs(
    executionId: string,
    ...logEntries: LogEntry[]
  ): Promise<void> {
    await this.props.cloudwatchLogsClient.send(
      new PutLogEventsCommand({
        logGroupName: this.props.serviceLogGroup,
        logStreamName: formatWorkflowExecutionStreamName(executionId),
        logEvents: logEntries.map(({ time, message }) => ({
          timestamp: time,
          message,
        })),
      })
    );
  }

  // TODO: handle throttle errors and retry at > 50TPS
  public async initializeExecutionLog(executionId: string): Promise<void> {
    await this.props.cloudwatchLogsClient.send(
      new CreateLogStreamCommand({
        logGroupName: this.props.serviceLogGroup,
        logStreamName: formatWorkflowExecutionStreamName(executionId),
      })
    );
  }
}
