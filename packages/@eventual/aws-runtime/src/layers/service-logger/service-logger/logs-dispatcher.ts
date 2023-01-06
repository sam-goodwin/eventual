import { LogLevel } from "@aws-lambda-powertools/logger/lib/types/Log.js";
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
  tryParseEventualLog,
} from "@eventual/core";
import { formatWorkflowExecutionStreamName } from "src/utils.js";
import { eventsQueue } from "./listener.js";

const logGroup = process.env.SERVICE_LOG_GROUP;
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
      "telemetry events"
    );

    const functionEvents = events.filter((e) => e.type === "function");
    const serializedEventualEvents = functionEvents.filter(
      (e) =>
        typeof e.record === "string" && isSerializedEventualLogContext(e.record)
    );

    const executionLogs = serializedEventualEvents
      .map((event) => ({
        time: event.time,
        log: tryParseEventualLog(event.record as unknown as string),
      }))
      .filter((e) => e.log.level && isSufficientLogLevel(e.log.level))
      .filter(
        (e): e is typeof e & { log: EventualLog<ExecutionLogContext> } =>
          !!e.log.context && isExecutionLogContext(e.log.context)
      );

    const executionEvents = groupBy(
      executionLogs,
      (e) => e.log.context.executionId
    );

    // send a batch for each execution
    await Promise.allSettled(
      Object.entries(executionEvents).map(([execution, es]) =>
        putExecutionLogs(execution, es)
      )
    );
  }
}

function putExecutionLogs(
  executionId: string,
  events: { time: string; log: EventualLog }[]
) {
  return cwl.send(
    new PutLogEventsCommand({
      logGroupName: logGroup,
      logStreamName: formatWorkflowExecutionStreamName(executionId),
      logEvents: events.map((e) => ({
        message: `${e.log.level} ${e.log.message}`,
        timestamp: new Date(e.time).getTime(),
      })),
    })
  );
}

async function isSufficientLogLevel(level: LogLevel) {
  return LOG_LEVELS.indexOf(level) >= logLevelIndex;
}
