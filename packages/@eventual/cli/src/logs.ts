import * as cwLogs from "@aws-sdk/client-cloudwatch-logs";
import { FilteredLogEvent } from "@aws-sdk/client-cloudwatch-logs";

export interface FunctionLogInput {
  functionName: string;
  friendlyName: string;
  startTime?: number;
  execution?: string;
  nextToken?: string;
}

export interface FunctionLogEvents {
  fn: FunctionLogInput;
  events: FilteredLogEvent[];
  nextToken?: string;
}

export interface LogEvent {
  source: string;
  ev: cwLogs.FilteredLogEvent;
}

/**
 * Get events from a list of function specs and interleave the results by timestamp
 * @param functions List of FunctionLogData describing functions to log
 * @param logs logs from associated functions
 * @returns Event log
 */
export function getInterleavedLogEvents(
  fnEvents: FunctionLogEvents[]
): LogEvent[] {
  const interleaved = fnEvents.flatMap(({ fn, events }) =>
    events.map((ev) => ({
      source: fn.friendlyName,
      ev,
    }))
  );
  // -1 is optimal placeholder for no timestamp, as we can safely assume cloudwatch will never send a timestamp < 0, and Number.MIN_VALUE will wrap around on subtraction
  interleaved.sort((a, b) => (a.ev.timestamp ?? -1) - (b.ev.timestamp ?? -1));
  return interleaved;
}

/**
 * Get inputs for fetching function logs following the given events
 * If there's a next token, we provide that and increment the start time
 * If there's no next token, we only increment the time from the incoming events
 * @param functions List of FunctionLogEvents describing functions to log and existing retrieved events
 * @returns Event log
 */
export function getFollowingFunctionLogInputs(
  fnEvents: FunctionLogEvents[],
  tail: boolean
): FunctionLogInput[] {
  if (tail) {
    return fnEvents.map(({ fn, events, nextToken }) => {
      //Its important to increment the start time even if we're just using next token, since once there's no more next token's,
      //we're going to rely on the latest start time value
      const latestEvent = events?.at(-1)?.timestamp;
      const startTime = latestEvent ? latestEvent + 1 : fn.startTime;
      if (nextToken) {
        return { ...fn, startTime, nextToken };
      } else {
        return {
          ...fn,
          nextToken: undefined,
          startTime,
        };
      }
    });
  } else {
    return fnEvents.flatMap(({ fn, nextToken }) =>
      nextToken != null && fn.nextToken !== nextToken
        ? [{ ...fn, nextToken }]
        : []
    );
  }
}

/**
 * Attempt to return a JSON-encoded message that was encoded using powertools logger
 * If that fails, we just return the raw message
 * @param ev Event to log
 * @returns Decoded message
 */
export function extractMessage(
  ev: cwLogs.FilteredLogEvent
): string | undefined {
  if (ev.message) {
    try {
      return JSON.parse(ev.message).message;
    } catch (e) {
      return ev.message;
    }
  } else {
    return undefined;
  }
}

/**
 * Return the start time for a given since value.
 * If since is not specified, return timestamp for 24hrs ago.
 * If it is 'now', return the current time. Otherwise expect a ISO8601 or millisecond timestamp
 * @param since timestamp specifier
 * @returns start time
 */
export function getStartTime(since: any): number | undefined {
  if (since == null) {
    //Now - 24hrs. If we don't provide a start time, it's too slow to page through all the logs
    return Date.now() - 86_400_000;
  } else if (since === "now") {
    return Date.now();
  } else {
    try {
      return new Date(since).getTime();
    } catch (e) {
      throw new Error(
        "Value provided for since is invalid. Must be a milliseconds timestamp or ISO8601"
      );
    }
  }
}

/**
 * Return all logs for a given FunctionLogInput. Will recurse until all logs are gathered
 * @param client Cloudwatch logs client to use
 * @param fn Function log input object describing logs to retrieve
 * @returns
 */
export async function getLogs(
  client: cwLogs.CloudWatchLogsClient,
  fn: FunctionLogInput
): Promise<{ events: cwLogs.FilteredLogEvent[]; nextToken?: string }> {
  const output = await client.send(
    new cwLogs.FilterLogEventsCommand({
      logGroupName: `/aws/lambda/${fn.functionName}`,
      filterPattern: fn.execution && `{ $.executionId = "${fn.execution}" }`,
      startTime: fn.startTime,
      nextToken: fn.nextToken,
    })
  );
  return { events: output.events ?? [], nextToken: output.nextToken };
}
