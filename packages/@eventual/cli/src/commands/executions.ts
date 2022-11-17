import { Execution } from "@eventual/core";
import { Argv } from "yargs";
import { apiAction, apiOptions } from "../api-action.js";
import { styledConsole } from "../styled-console.js";

type KeysOfUnion<T> = T extends T ? keyof T : never;
type MergedRecord<T> = Record<KeysOfUnion<T>, any>;

const sortKeys = ["id", "endTime", "result", "startTime", "status"] as const;

export const executions = (yargs: Argv) =>
  yargs.command(
    "executions <workflow>",
    "List executions of a workflow",
    (yargs) =>
      yargs
        .options(apiOptions)
        .option("sort", {
          alias: "s",
          describe: "Sort by field",
          choices: sortKeys,
        })
        .positional("workflow", {
          describe: "Workflow name",
          type: "string",
          demandOption: true,
        }),
    apiAction(async (spinner, ky, { workflow, sort }) => {
      if (sort && !sortKeys.includes(sort)) {
        styledConsole.error("Invalid sort");
        styledConsole.error(`Valid options are: ${sortKeys.join(" | ")}`);
        process.exit(1);
      }
      spinner.start("Getting workflow executions");
      const executions = await ky
        .get(`workflows/${workflow}/executions`)
        .json<MergedRecord<Execution>[]>();
      spinner.stop();
      if (sort) {
        executions.sort((a, b) => (a[sort] ?? "").localeCompare(b[sort] ?? ""));
      }
      console.log(executions);
    })
  );
