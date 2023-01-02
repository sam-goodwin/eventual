import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";

export const executions = (yargs: Argv) =>
  yargs.command(
    "executions",
    "List executions of a service, or optionally, a workflow",
    (yargs) =>
      setServiceOptions(yargs).option("workflow", {
        describe: "Workflow name",
        type: "string",
      }),
    serviceAction(async (spinner, service, { workflow }) => {
      spinner.start("Getting executions");
      // TODO: support pagination, sort order, status filtering
      const { executions } = await service.getExecutions({
        workflowName: workflow as string,
        sortDirection: "Desc",
        maxResults: 100,
      });
      spinner.stop();
      console.log(JSON.stringify(executions, null, 2));
    })
  );
