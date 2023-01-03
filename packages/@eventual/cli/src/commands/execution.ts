import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { displayExecution } from "../display/execution.js";

export const execution = (yargs: Argv) =>
  yargs.command(
    "execution",
    "Get data about an execution",
    (yargs) =>
      setServiceOptions(yargs, true).option("execution", {
        alias: "e",
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
        spinner.stop();
        process.stdout.write(
          displayExecution(execution, { results: true, workflow: true }) + "\n"
        );
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
