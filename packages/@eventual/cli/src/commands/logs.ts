import * as cwLogs from "@aws-sdk/client-cloudwatch-logs";
import ora, { Ora } from "ora";
import { Argv } from "yargs";
import chalk from "chalk";
import { getServiceData, tryResolveDefaultService } from "../service-data.js";
import { setServiceOptions } from "../service-action.js";
import { assumeCliRole } from "../role.js";

/**
 * Command to list logs for a workflow or execution id
 * Defaults to showing the last 24 hours of logs (All time logs would take too long to retrieve)
 * eg $ eventual get logs --workflow my-workflow
 * eg $ eventual get logs --workflow my-workflow --execution execution_123
 * eg $ eventual get logs --workflow my-workflow --execution execution_123 --since 12333535
 * @returns
 */
export const logs = (yargs: Argv) =>
  yargs.command(
    "logs",
    "Get logs for a given service, optionally filtered by a given workflow or execution",
    (yargs) =>
      setServiceOptions(yargs)
        .option("workflow", {
          alias: "w",
          describe: "Workflow name",
          type: "string",
          conflicts: ["execution", "all"],
        })
        .option("execution", {
          alias: "e",
          describe: "Execution id",
          type: "string",
          conflicts: ["workflow", "all"],
        })
        .option("all", {
          describe: "Get all workflow logs for the service",
          type: "boolean",
          conflicts: ["workflow", "execution"],
        })
        .option("since", {
          describe:
            "Only show logs from given time. Timestamp in milliseconds, ISO8601",
          defaultDescription: "24 hours ago",
        })
        .option("follow", {
          alias: "f",
          describe: "Watch logs indefinitely",
          default: false,
          type: "boolean",
        })
        .check((args) => {
          if (!(args.all || args.execution || args.workflow)) {
            throw new Error(
              "One of: all, execution, or workflow must be provided"
            );
          }
          return true;
        }),
    async ({
      service: _service,
      workflow,
      execution,
      region,
      since,
      follow,
    }) => {
      const startTime = getStartTime(since as string | number);
      const spinner = ora("Loading logs");
      const service = await tryResolveDefaultService(_service);
      if (!service) {
        throw new Error(
          "Service must be set using --service or EVENTUAL_DEFAULT_SERVICE."
        );
      }
      const credentials = await assumeCliRole(service, region);
      const { logGroupName } = await getServiceData(
        credentials,
        service,
        region
      );
      const cloudwatchLogsClient = new cwLogs.CloudWatchLogsClient({});

      const logFilter: LogFilter = {
        executionId: execution,
        workflowName: workflow,
      };

      let logCursor: LogCursor = {
        startTime,
      };

      do {
        const fetchResult = await fetchLogs(
          spinner,
          cloudwatchLogsClient,
          logGroupName,
          logFilter,
          logCursor
        );
        logCursor = updateLogCursor(logCursor, fetchResult, follow);

        if (follow) {
          spinner.start("Watching logs");
          await sleep(1000);
        } else if (logCursor.nextToken) {
          spinner.start("Loading more");
        }
        // eslint-disable-next-line no-unmodified-loop-condition
      } while (follow || logCursor.nextToken);
      spinner.stop();
    }
  );

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

interface GetLogResult {
  nextToken?: string;
  latestEvent?: number;
}

async function fetchLogs(
  spinner: Ora,
  cloudwatchLogsClient: cwLogs.CloudWatchLogsClient,
  logGroupName: string,
  logFilter: LogFilter,
  logCursor: LogCursor
): Promise<GetLogResult> {
  const output = await cloudwatchLogsClient.send(
    new cwLogs.FilterLogEventsCommand({
      logGroupName,
      ...(logFilter.workflowName
        ? { logStreamNamePrefix: logFilter.workflowName }
        : {}),
      ...(logFilter.executionId
        ? { logStreamNames: [logFilter.executionId] }
        : {}),
      startTime: logCursor.startTime,
      nextToken: logCursor.nextToken,
    })
  );

  const functionEvents = output.events ?? [];

  // Print out the interleaved logs
  if (functionEvents.length) {
    spinner.stop();
    functionEvents.forEach((ev) => {
      console.log(
        `${
          logFilter.executionId ? "" : `[${chalk.blue(ev.logStreamName)}] `
        }${chalk.red(new Date(ev.timestamp!).toLocaleString())} ${ev.message}`
      );
    });
  }

  return {
    latestEvent: Math.max(
      ...functionEvents.map((e) => e.timestamp).filter((t): t is number => !!t)
    ),
    nextToken: output.nextToken,
  };
}

interface LogFilter {
  executionId?: string;
  workflowName?: string;
}

interface LogCursor {
  startTime?: number;
  nextToken?: string;
}

/**
 * Get inputs for fetching function logs following the given events
 * If there's a next token, we provide that and increment the start time
 * If there's no next token, we only increment the time from the incoming events
 * @param functions List of FunctionLogEvents describing functions to log and existing retrieved events
 * @returns Event log
 */
export function updateLogCursor(
  logFilter: LogCursor,
  getLogResult: GetLogResult,
  follow: boolean
): LogCursor {
  if (follow) {
    return {
      startTime: getLogResult.latestEvent
        ? getLogResult.latestEvent + 1
        : logFilter.startTime,
      nextToken: getLogResult.nextToken,
    };
  } else {
    return {
      nextToken: getLogResult.nextToken,
    };
  }
}

/**
 * Return the start time for a given since value.
 * If since is not specified, return timestamp for 24hrs ago.
 * If it is 'now', return the current time. Otherwise expect a ISO8601 or millisecond timestamp
 * @param since timestamp specifier
 * @returns start time
 */
export function getStartTime(
  since: number | string | "now"
): number | undefined {
  if (since == null) {
    // Now - 24hrs. If we don't provide a start time, it's too slow to page through all the logs
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
