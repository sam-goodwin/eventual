import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { EventualServiceClient } from "@eventual/core";
import { displayExecution } from "../display/execution.js";

export const listExecutions = (yargs: Argv) =>
  yargs.command(
    "executions",
    "List executions of a service, or optionally, a workflow",
    (yargs) =>
      setServiceOptions(yargs, true).option("workflow", {
        alias: "w",
        describe: "Workflow name",
        type: "string",
      }),
    serviceAction(
      async (spinner, service, { workflow }) => {
        spinner.start("Getting executions");
        // TODO: support pagination, sort order, status filtering
        const executions = await getExecutions(service, workflow);
        spinner.stop();
        executions.forEach((execution) => {
          process.stdout.write(
            `${displayExecution(execution, {
              results: false,
              workflow: false,
            })}\n\n`
          );
        });
      },
      async (service, { workflow }) => {
        const executions = await getExecutions(service, workflow);

        process.stdout.write(JSON.stringify(executions));
        process.stdout.write("\n");
      }
    )
  );

async function getExecutions(
  service: EventualServiceClient,
  workflowName?: string
) {
  const { executions } = await service.getExecutions({
    workflowName,
    sortDirection: "Desc",
    maxResults: 100,
  });

  return executions;
}
