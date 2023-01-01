import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import Table from "cli-table3";
import { ExecutionStatus } from "@eventual/core";

export const execution = (yargs: Argv) =>
  yargs.command(
    "execution <service> <execution>",
    "Get data about an execution",
    (yargs) =>
      setServiceOptions(yargs, true).positional("execution", {
        describe: "Execution id",
        type: "string",
        demandOption: true,
      }),
    serviceAction(
      async (spinner, service, { execution: executionId }) => {
        spinner.start("Getting executions");
        // TODO: support pagination, sort order, status filtering
        const execution = await service.getExecution(executionId);
        if (!execution) {
          spinner.fail(`Execution ${executionId} was not found.`);
          return;
        }
        const table = new Table({
          head: ["Workflow", "Status", "StartTime", "EndTime", "Result"],
        });
        table.push([
          execution.workflowName,
          execution.status,
          execution.startTime,
          execution.status === ExecutionStatus.IN_PROGRESS
            ? undefined
            : execution.endTime,
          execution.status === ExecutionStatus.COMPLETE
            ? execution.result
            : execution.status === ExecutionStatus.FAILED
            ? `${execution.error}: ${execution.message}`
            : undefined,
        ]);
        spinner.stop();
        process.stdout.write(table.toString() + "\n");
      },
      async (service, { execution: executionId }) => {
        const execution = await service.getExecution(executionId);
        if (!execution) {
          process.stdout.write("\n");
        } else {
          process.stdout.write(`${JSON.stringify(execution)}\n`);
        }
      }
    )
  );
