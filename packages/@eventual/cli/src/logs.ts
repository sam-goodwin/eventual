import * as cwLogs from "@aws-sdk/client-cloudwatch-logs";
import { FilteredLogEvent } from "@aws-sdk/client-cloudwatch-logs";

export interface FunctionLogInput {
  functionName: string;
  friendlyName: string;
  startTime?: number;
}

export interface FunctionLogEvents {
  fn: FunctionLogInput;
  events: FilteredLogEvent[];
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
 * @param functions List of FunctionLogEvents describing functions to log and existing retrieved events
 * @returns Event log
 */
export function getFollowingFunctionLogInputs(
  events: FunctionLogEvents[]
): FunctionLogInput[] {
  return events.map(
    ({ fn: { functionName, friendlyName, startTime }, events }) => {
      const latestEvent = events?.at(-1)?.timestamp;
      return {
        functionName,
        friendlyName,
        startTime: latestEvent ? latestEvent + 1 : startTime,
      };
    }
  );
}
