import {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  InvalidParameterException,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  getLazy,
  LazyValue,
  LogEntry,
  LogsClient,
} from "@eventual/runtime-core";
import { formatWorkflowExecutionStreamName } from "../utils.js";

export interface AWSLogsClientProps {
  cloudwatchLogsClient: CloudWatchLogsClient;
  serviceLogGroup: LazyValue<string>;
}

export class AWSLogsClient implements LogsClient {
  constructor(private props: AWSLogsClientProps) {}

  public async putExecutionLogs(
    executionId: string,
    ...logEntries: LogEntry[]
  ): Promise<void> {
    try {
      await this.props.cloudwatchLogsClient.send(
        new PutLogEventsCommand({
          logGroupName: getLazy(this.props.serviceLogGroup),
          logStreamName: formatWorkflowExecutionStreamName(executionId),
          logEvents: logEntries.map(({ time, message }) => ({
            timestamp: time,
            message,
          })),
        })
      );
    } catch (err) {
      console.error("Log Client Put Execution Logs Error: ", err);
      if (err instanceof InvalidParameterException) {
        throw new Error(`${err.name}: ${err.message}`);
      }
      throw err;
    }
  }

  // TODO: handle throttle errors and retry at > 50TPS
  public async initializeExecutionLog(executionId: string): Promise<void> {
    await this.props.cloudwatchLogsClient.send(
      new CreateLogStreamCommand({
        logGroupName: getLazy(this.props.serviceLogGroup),
        logStreamName: formatWorkflowExecutionStreamName(executionId),
      })
    );
  }
}
