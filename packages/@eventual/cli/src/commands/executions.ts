import { Execution } from "@eventual/core";
import { Command } from "commander";
import { apiAction, apiCommand } from "../api-action.js";
import { styledConsole } from "../styled-console.js";

const sortKeys = ["id", "endTime", "result", "startTime", "status"];
export const executions = apiCommand((command: Command) =>
  command
    .description("List executions of a workflow")
    .argument("<name>", "Workflow name")
    .option("--sort <field>", `Sort by field: ${sortKeys.join(" | ")}`)
    .action(
      apiAction(
        async (spinner, ky, workflow, { sort }: { sort: keyof Execution }) => {
          if (sort && !sortKeys.includes(sort)) {
            styledConsole.error("Invalid sort");
            styledConsole.error(`Valid options are: ${sortKeys.join(" | ")}`);
            process.exit(1);
          }
          spinner.start("Getting workflow executions");
          const executions = await ky
            .get(`workflows/${workflow}/executions`)
            .json<Execution[]>();
          spinner.stop();
          if (sort) {
            executions.sort((a, b) =>
              (a[sort] ?? "").localeCompare(b[sort] ?? "")
            );
          }
          console.log(executions);
        }
      )
    )
);
