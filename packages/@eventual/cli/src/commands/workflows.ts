import { Argv } from "yargs";
import { serviceAction, setServiceOptions } from "../service-action.js";
import { styledConsole } from "../styled-console.js";

export const workflows = (yargs: Argv) =>
  yargs.command(
    "workflows",
    "List workflows of a service",
    setServiceOptions,
    serviceAction(async (spinner, serviceClient) => {
      spinner.start("Getting workflow");
      const { workflows } = await serviceClient.getWorkflows();
      spinner.stop();
      styledConsole.success("Workflows");
      workflows.forEach((workflow) => {
        console.log(workflow.name);
      });
    })
  );
