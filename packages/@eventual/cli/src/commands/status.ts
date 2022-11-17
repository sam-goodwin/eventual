import { Command } from "commander";
import { apiAction, apiCommand } from "../api-action.js";

export const status = apiCommand((command: Command) =>
  command
    .description("Get events in an execution")
    .option("-w, --workflow <name>", "Workflow name")
    .option("-e, --execution <id>", "Execution id")
    .action(
      apiAction(async (spinner, ky, { workflow, execution }) => {
        spinner.start("Getting workflow events");
        const events = await ky
          .get(`workflows/${workflow}/executions/${execution}`)
          .json();
        spinner.succeed();
        console.log(events);
      })
    )
);
