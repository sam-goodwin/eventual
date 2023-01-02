import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";

export const history = (yargs: Argv) =>
  yargs.command(
    "history <execution>",
    "Get execution history",
    (yargs) =>
      setServiceOptions(yargs).positional("execution", {
        describe: "Execution Id",
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
      console.log(events);
    })
  );
