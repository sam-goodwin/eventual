import * as cwLogs from "@aws-sdk/client-cloudwatch-logs";

export interface FunctionLogInput {
  functionName: string;
  friendlyName: string;
  startTime: number;
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
  functions: FunctionLogInput[],
  logs: cwLogs.FilterLogEventsCommandOutput[]
): LogEvent[] {
  const interleaved = zip(functions, logs).flatMap(
    ([{ friendlyName }, { events }]) =>
      events?.map((ev) => ({
        source: friendlyName,
        ev,
      })) ?? []
  );
  interleaved.sort((a, b) => a.ev.timestamp! - b.ev.timestamp!);
  return interleaved;
}

export function getNextFunctionLogInputs(
  functions: FunctionLogInput[],
  logs: cwLogs.FilterLogEventsCommandOutput[]
): FunctionLogInput[] {
  return zip(functions, logs).flatMap(
    ([{ functionName, friendlyName, startTime }, { events }]) => {
      const latestEvent = events?.at(-1)?.timestamp;
      return {
        functionName,
        friendlyName,
        startTime: latestEvent ? latestEvent + 1 : startTime,
      };
    }
  );
}

function zip<X, Y>(x: X[], y: Y[]): [X, Y][] {
  return Array.from({ length: Math.min(x.length, y.length) }, (_, i) => [
    x[i]!,
    y[i]!,
  ]);
}
