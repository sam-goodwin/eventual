import { program } from "commander";
import { listWorkflowsCommand } from "./commands/listWorkflowsCommand.js";

const cli = program.name("stik").description("Eventual CLI");

cli.command("workflows").addCommand(listWorkflowsCommand);

export { cli };
