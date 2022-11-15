import { apiAction, apiCommand } from "../../api-action.js";

export const listExecutions = apiCommand("list")
  .description("List executions of a workflow")
  .option("-w, --workflow <name>", "Workflow name")
  .action(
    apiAction(async (spinner, ky, { workflow }) => {
      spinner.start("Getting workflow executions");
      const executions = await ky
        .get(`workflows/${workflow}/executions`)
        .json();
      spinner.succeed();
      console.log(executions);
    })
  );
