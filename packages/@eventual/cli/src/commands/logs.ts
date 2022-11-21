import * as cwLogs from "@aws-sdk/client-cloudwatch-logs";
import * as cfn from "@aws-sdk/client-cloudformation";
import ora from "ora";
import { Argv } from "yargs";
import chalk from "chalk";
import {
  FunctionLogInput,
  getFollowingFunctionLogInputs,
  getInterleavedLogEvents,
} from "../logs.js";

/**
 * Command to list logs for a workflow or execution id
 * eg $ eventual logs my-workflow
 * eg $ eventual logs my-workflow execution_123
 * eg $ eventual logs my-workflow execution_123 --since 12333535
 * @returns
 */
export const logs = (yargs: Argv) =>
  yargs.command(
    "logs <workflow> [execution]",
    "Get logs",
    (yargs) =>
      yargs
        .positional("workflow", {
          describe: "Workflow name",
          type: "string",
          demandOption: true,
        })
        .positional("execution", {
          describe: "Execution id",
          type: "string",
        })
        .option("since", {
          describe:
            "Only show logs from given time. Timestamp in milliseconds, ISO8601",
          defaultDescription: "Current time",
          default: Date.now() as string | number,
        }),
    async ({ workflow, execution, since }) => {
      const startTime = getStartTime(since);
      const spinner = ora("Loading logs");
      const cfnClient = new cfn.CloudFormationClient({});
      const { Exports } = await cfnClient.send(new cfn.ListExportsCommand({}));
      const workflowData = Exports?.find(
        (v) => v.Name === `eventual-workflow-data:${workflow}`
      )?.Value;
      if (!workflowData) {
        spinner.fail(
          "Couldn't fetch workflow metadata. Have you deployed the workflow?"
        );
        process.exit(1);
      }
      const { functions } = JSON.parse(workflowData);
      const cloudwatchLogsClient = new cwLogs.CloudWatchLogsClient({});

      async function pollLogs(functions: FunctionLogInput[]) {
        const functionEvents = await Promise.all(
          functions.map(async (fn) => ({
            fn,
            ...(await getLogs(cloudwatchLogsClient, fn)),
          }))
        );
        const interleavedEvents = getInterleavedLogEvents(functionEvents);

        if (interleavedEvents.length) {
          spinner.clear();

          interleavedEvents.forEach(({ source, ev }) => {
            console.log(
              `[${chalk.blue(source)}] ${chalk.red(
                new Date(ev.timestamp!).toLocaleString()
              )} ${extractMessage(ev)}`
            );
          });

          spinner.start("Watching logs");
        }
        //Wait a little while before polling again, to give the servers a break
        setTimeout(
          () => pollLogs(getFollowingFunctionLogInputs(functionEvents)),
          100
        );
      }

      spinner.start("Watching logs");
      await pollLogs([
        {
          functionName: functions.orchestrator,
          friendlyName: "orchestrator",
          execution,
          startTime,
        },
        {
          functionName: functions.activityWorker,
          friendlyName: "activityWorker",
          execution,
          startTime,
        },
      ]);
    }
  );

/**
 * Attempt to return a JSON-encoded message that was encoded using powertools logger
 * If that fails, we just return the raw message
 * @param ev Event to log
 * @returns Decoded message
 */
function extractMessage(ev: cwLogs.FilteredLogEvent): string | undefined {
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
 * If since is 'now', return the current time. Otherwise expect a ISO8601 or millisecond timestamp
 * @param since timestamp specifier
 * @returns start time
 */
function getStartTime(since: string | number): number {
  if (since == null) {
    return Date.now();
  }
  try {
    return new Date(since).getTime();
  } catch (e) {
    throw new Error(
      "Value provided for since is invalid. Must be a milliseconds timestamp or ISO8601"
    );
  }
}

/**
 * Return all logs for a given FunctionLogInput. Will recurse until all logs are gathered
 * @param client Cloudwatch logs client to use
 * @param fn Function log input object describing logs to retrieve
 * @returns
 */
async function getLogs(
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
