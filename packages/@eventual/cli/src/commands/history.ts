import { apiAction, apiOptions } from "../api-action.js";
import { Argv } from "yargs";

export const history = (yargs: Argv) =>
  yargs.command(
    "history <workflow> <execution>",
    "Get execution history",
    (yargs) =>
      yargs
        .options(apiOptions)
        .positional("workflow", {
          describe: "Workflow name",
          type: "string",
          demandOption: true,
        })
        .positional("execution", {
          describe: "Execution Id",
          type: "string",
          demandOption: true,
        }),
    apiAction(async (spinner, ky, { workflow, execution }) => {
      spinner.start("Getting execution history");
      const events = await ky
        .get(`workflows/${workflow}/executions/${execution}`)
        .json();
      spinner.succeed();
      console.log(events);
    })
  );
