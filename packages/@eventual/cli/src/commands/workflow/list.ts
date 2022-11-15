import { apiAction, apiCommand } from "../../api-action.js";

export const list = apiCommand("list")
  .description("List Eventual workflows")
  .action(
    apiAction(async (spinner, ky) => {
      spinner.start("Fetching workflows");
      const workflows = await ky("workflows").json<string[]>();
      workflows.forEach((w) => console.log(w));
    })
  );
