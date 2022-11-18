import * as cwLogs from "@aws-sdk/client-cloudwatch-logs";
import * as cfn from "@aws-sdk/client-cloudformation";
import ora from "ora";
import { Argv } from "yargs";
import chalk from "chalk";
import {
  FunctionLogInput,
  getInterleavedLogEvents,
  getNextFunctionLogInputs,
} from "../logs.js";

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

      async function pollLogs(functions: FunctionLogInput[]) {
        const logs = await Promise.all(
          functions.map(async ({ functionName, startTime }) =>
            cloudwatchLogsClient.send(
              new cwLogs.FilterLogEventsCommand({
                logGroupName: `/aws/lambda/${functionName}`,
                startTime: startTime,
              })
            )
          )
        );
        const interleavedEvents = getInterleavedLogEvents(functions, logs);

        if (interleavedEvents.length) {
          spinner.clear();

          interleavedEvents.forEach(({ source, ev }) =>
            console.log(
              `[${chalk.blue(source)}] ${chalk.red(
                new Date(ev.timestamp!).toLocaleString()
              )} ${ev.message}`
            )
          );

          spinner.start("Watching logs");
        }
        setTimeout(
          () => pollLogs(getNextFunctionLogInputs(functions, logs)),
          1000
        );
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
