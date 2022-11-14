import { program } from "commander";
import { EVENTUAL_VERSION } from "./constants";
import { listWorkflowsCommand } from "./commands/listWorkflowsCommand";

const cli = program
  .name("stik")
  .version(EVENTUAL_VERSION)
  .description("Eventual CLI");

cli.command("workflows").addCommand(listWorkflowsCommand);

export { cli };
