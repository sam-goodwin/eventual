import { apiAction, apiCommand } from "../../api-action.js";

export const listWorkflows = apiCommand("list")
  .description("List Eventual workflows")
  .action(
    apiAction(async (spinner, ky) => {
      spinner.start("Fetching workflows");
      const workflows = await ky("workflows").json<string[]>();
      spinner.succeed();
      workflows.forEach((w) => console.log(w));
    })
  );
