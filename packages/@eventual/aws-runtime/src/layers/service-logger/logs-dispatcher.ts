import {
  CloudWatchLogsClient,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  EventualLog,
  ExecutionLogContext,
  groupBy,
  isExecutionLogContext,
  isSerializedEventualLogContext,
  LogLevel,
  promiseAllSettledPartitioned,
  tryParseEventualLog,
} from "@eventual/core";
import { serviceLogGroupName } from "../../env.js";
import { formatWorkflowExecutionStreamName } from "../../utils.js";
import { inspect } from "util";
import { eventsQueue } from "./listener.js";

const logGroup = serviceLogGroupName();
const LOG_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"];
const logLevel = "DEBUG";
const logLevelIndex = LOG_LEVELS.indexOf(logLevel);

const cwl = new CloudWatchLogsClient({});

export async function dispatch(queue: typeof eventsQueue) {
  if (queue.hasNext()) {
    const events = queue.drain();
    console.log(
      "[telementry-dispatcher:dispatch] Dispatching",
      events.length,
      "telemetry events",
      JSON.stringify(events)
    );

    const functionEvents = events.filter((e) => e.type === "function");
    const serializedEventualEvents = functionEvents.filter(
      (e) =>
        typeof e.record === "string" && isSerializedEventualLogContext(e.record)
    );

    const executionLogs = serializedEventualEvents.map((event) => ({
      time: event.time,
      log: tryParseEventualLog(event.record as unknown as string),
    }));

    console.log("logs before filter", JSON.stringify(executionLogs));

    const logsToSend = executionLogs
      .filter((e) => e.log.level && isSufficientLogLevel(e.log.level))
      .filter(
        (e): e is typeof e & { log: EventualLog<ExecutionLogContext> } =>
          !!e.log.context && isExecutionLogContext(e.log.context)
      );

    const executionEvents = groupBy(
      logsToSend,
      (e) => e.log.context.executionId
    );

    console.log("events to log", JSON.stringify(executionEvents));

    // send a batch for each execution
    const result = await promiseAllSettledPartitioned(
      Object.entries(executionEvents),
      ([execution, es]) => putExecutionLogs(execution, es)
    );

    console.log("failed", JSON.stringify(result.rejected));
  }
}

function putExecutionLogs(
  executionId: string,
  events: { time: string; log: EventualLog }[]
) {
  const request = {
    logGroupName: logGroup,
    logStreamName: formatWorkflowExecutionStreamName(executionId),
    logEvents: events.map((e) => ({
      message: `${e.log.level} ${e.log.message}`,
      timestamp: new Date(e.time).getTime(),
    })),
  };

  console.log("putLogs", JSON.stringify(request));

  try {
    return cwl.send(new PutLogEventsCommand(request));
  } catch (err) {
    console.error("put logs err", inspect(err));
    throw err;
  }
}

async function isSufficientLogLevel(level: LogLevel) {
  return LOG_LEVELS.indexOf(level) >= logLevelIndex;
}
