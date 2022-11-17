import { apiAction, apiOptions } from "../api-action.js";
import { Argv } from "yargs";

export const workflows = (yargs: Argv) =>
  yargs.command(
    ["workflows"],
    "List Eventual workflows",
    apiOptions,
    apiAction(async (spinner, ky) => {
      spinner.start("Getting workflows");
      const workflows = await ky("workflows").json<string[]>();
      spinner.stop();
      workflows.forEach((w) => console.log(w));
    })
  );
