import {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  FilterLogEventsCommand,
  FilterLogEventsCommandInput,
  InvalidParameterException,
  PutLogEventsCommand,
  ResourceAlreadyExistsException,
} from "@aws-sdk/client-cloudwatch-logs";
import { LazyValue, LogsClient, getLazy } from "@eventual/core-runtime";
import {
  GetExecutionLogsRequest,
  GetExecutionLogsResponse,
  LogEntry,
  LogEvent,
} from "@eventual/core/internal";
import {
  formatWorkflowExecutionStreamName,
  isAwsErrorOfType,
} from "../utils.js";

export interface AWSLogsClientProps {
  cloudwatchLogsClient: CloudWatchLogsClient;
  serviceLogGroup: LazyValue<string>;
}

export class AWSLogsClient implements LogsClient {
  constructor(private props: AWSLogsClientProps) {}

  public async getExecutionLogs(
    request: GetExecutionLogsRequest
  ): Promise<GetExecutionLogsResponse> {
    if (request.executionId && request.workflowName) {
      throw new Error(
        "One of executionId, workflowName, or neither are allowed."
      );
    }
    const logFilter: Partial<FilterLogEventsCommandInput> = request.executionId
      ? { logStreamNames: [request.executionId] }
      : request.workflowName
      ? { logStreamNamePrefix: request.workflowName }
      : {};
    const result = await this.props.cloudwatchLogsClient.send(
      new FilterLogEventsCommand({
        logGroupName: getLazy(this.props.serviceLogGroup),
        ...logFilter,
        startTime: request.startTime
          ? new Date(request.startTime).getTime()
          : undefined,
        nextToken: request.nextToken,
      })
    );
    const events =
      result.events?.map(
        (e): LogEvent => ({
          message: e.message ?? "",
          time: e.timestamp!,
          source: e.logStreamName!,
        })
      ) ?? [];
    return {
      events,
      nextToken: result.nextToken,
    };
  }

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
      if (
        isAwsErrorOfType<InvalidParameterException>(
          err,
          "InvalidParameterException"
        )
      ) {
        throw new Error(`${err.name}: ${err.message}`);
      }
      throw err;
    }
  }

  // TODO: handle throttle errors and retry at > 50TPS
  public async initializeExecutionLog(executionId: string): Promise<void> {
    try {
      await this.props.cloudwatchLogsClient.send(
        new CreateLogStreamCommand({
          logGroupName: getLazy(this.props.serviceLogGroup),
          logStreamName: formatWorkflowExecutionStreamName(executionId),
        })
      );
    } catch (err) {
      // if the resource already exists, then there is no work to do.
      if (
        isAwsErrorOfType<ResourceAlreadyExistsException>(
          err,
          "ResourceAlreadyExistsException"
        )
      ) {
        return;
      }
      throw err;
    }
  }
}
