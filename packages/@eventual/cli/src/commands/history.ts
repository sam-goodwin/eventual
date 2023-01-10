import { Argv } from "yargs";
import { displayEvent } from "../display/execution.js";
import { serviceAction, setServiceOptions } from "../service-action.js";

export const history = (yargs: Argv) =>
  yargs.command(
    "history",
    "Get execution history",
    (yargs) =>
      setServiceOptions(yargs).option("execution", {
        alias: "e",
        describe: "Execution id",
        type: "string",
        demandOption: true,
      }),
    serviceAction(async (spinner, serviceClient, { execution }) => {
      spinner.start("Getting execution history");
      // TODO: support pagination and sort direction
      const { events } = await serviceClient.getExecutionHistory({
        executionId: execution,
      });
      spinner.succeed();
      events.forEach((e) => {
        process.stdout.write(displayEvent(e));
        process.stdout.write("\n");
      });
    })
  );
