import * as cwLogs from "@aws-sdk/client-cloudwatch-logs";
import * as cfn from "@aws-sdk/client-cloudformation";
import ora from "ora";
import { Argv } from "yargs";
import chalk from "chalk";

export const logs = (yargs: Argv) =>
  yargs.command(
    "logs <workflow>",
    "Get logs",
    (yargs) =>
      yargs.positional("workflow", {
        describe: "Workflow name",
        type: "string",
        demandOption: true,
      }),
    async ({ workflow }) => {
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

      async function pollLogs(functions: FunctionLogPollData[]) {
        const logs = await Promise.all(
          functions.map(async ({ friendlyName, functionName, startTime }) => {
            const { events } = await cloudwatchLogsClient.send(
              new cwLogs.FilterLogEventsCommand({
                logGroupName: `/aws/lambda/${functionName}`,
                startTime: startTime,
              })
            );
            const latestEvent = events?.at(-1)?.timestamp;
            return {
              functionName,
              friendlyName,
              logs: events?.map((ev) => ({ source: friendlyName, ev })) ?? [],
              startTime: latestEvent ? latestEvent + 1 : startTime,
            };
          })
        );
        const allEvents = logs.flatMap(({ logs }) => logs);
        allEvents.sort((a, b) => a.ev.timestamp! - b.ev.timestamp!);

        if (allEvents.length) {
          spinner.clear();

          allEvents.forEach(({ source, ev }) =>
            console.log(
              `[${chalk.blue(source)}] ${chalk.red(
                new Date(ev.timestamp!).toLocaleString()
              )} ${ev.message}`
            )
          );

          spinner.start("Watching logs");
        }
        setTimeout(() => pollLogs(logs), 1000);
      }

      spinner.start("Watching logs");
      const fiveMinutesAgo = Date.now() - 300_000;
      await pollLogs([
        {
          functionName: functions.orchestrator,
          friendlyName: "orchestrator",
          startTime: fiveMinutesAgo,
        },
        {
          functionName: functions.activityWorker,
          friendlyName: "activityWorker",
          startTime: fiveMinutesAgo,
        },
      ]);
    }
  );

interface FunctionLogPollData {
  functionName: string;
  friendlyName: string;
  startTime: number;
}
