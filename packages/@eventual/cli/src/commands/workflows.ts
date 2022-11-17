import { apiAction, apiCommand } from "../api-action.js";

export const workflows = apiCommand((command) =>
  command.description("List Eventual workflows").action(
    apiAction(async (spinner, ky) => {
      spinner.start("Fetching workflows");
      const workflows = await ky("workflows").json<string[]>();
      spinner.stop();
      workflows.forEach((w) => console.log(w));
    })
  )
);
