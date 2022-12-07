import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { styledConsole } from "../styled-console.js";

export const workflows = (yargs: Argv) =>
  yargs.command(
    "workflows <service>",
    "List workflows of a service",
    setServiceOptions,
    serviceAction(async (spinner, ky) => {
      spinner.start("Getting workflow");
      const workflows = await ky.get(`_eventual/workflows`).json<string[]>();
      spinner.stop();
      styledConsole.success("Workflows");
      workflows.forEach((workflow) => {
        console.log(workflow);
      });
    })
  );
