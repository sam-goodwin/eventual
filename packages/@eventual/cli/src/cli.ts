import { program } from "commander";
import { list, execute, status } from "./commands/workflow/index.js";

const cli = program.name("stik").description("Eventual CLI");

cli
  .command("workflows")
  .addCommand(list)
  .addCommand(execute)
  .addCommand(status);

export { cli };
