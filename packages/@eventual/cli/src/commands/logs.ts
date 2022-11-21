import * as cwLogs from "@aws-sdk/client-cloudwatch-logs";
import * as cfn from "@aws-sdk/client-cloudformation";
import ora from "ora";
import { Argv } from "yargs";
import chalk from "chalk";
import {
  extractMessage,
  FunctionLogInput,
  getFollowingFunctionLogInputs,
  getInterleavedLogEvents,
  getLogs,
  getStartTime,
} from "../logs.js";

/**
 * Command to list logs for a workflow or execution id
 * Defaults to showing the last 24 hours of logs (All time logs would take too long to retrieve)
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
          defaultDescription: "24 hours ago",
        })
        .option("tail", {
          describe: "Watch logs indefinitely",
          default: false,
          type: "boolean",
        }),
    async ({ workflow, execution, since, tail }) => {
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

      async function fetchLogs(functions: FunctionLogInput[]) {
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
        }
        const nextInputs = getFollowingFunctionLogInputs(functionEvents, tail);
        if (tail) {
          spinner.start("Watching logs");
          setTimeout(
            () => fetchLogs(nextInputs),
            1000 // Wait a little while before polling again, to give the servers a break
          );
        } else {
          spinner.start("Fetching next batch");
          if (nextInputs.length) {
            await fetchLogs(nextInputs);
          } else {
            spinner.stop();
          }
        }
      }

      spinner.start("Watching logs");
      await fetchLogs([
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
