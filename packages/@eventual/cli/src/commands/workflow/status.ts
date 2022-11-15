import { apiAction, apiCommand } from "../../api-action.js";

export const status = apiCommand("status")
  .description("Get status of a workflow")
  .argument("<name>", "Workflow name")
  .action(
    apiAction(async (spinner, ky, _options, name) => {
      spinner.start("Getting workflow status");
      const execution = await ky.get(`workflows/${name}`).json();
      console.log(execution);
    })
  );
