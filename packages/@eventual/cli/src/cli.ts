import { program } from "commander";
import { executionEvents } from "./commands/executions/events.js";
import { listExecutions } from "./commands/executions/list.js";
import { newExecution } from "./commands/executions/new.js";
import { listWorkflows } from "./commands/workflow/list.js";

const cli = program.name("stik").description("Eventual CLI");

cli.command("workflows").addCommand(listWorkflows);

cli
  .command("executions")
  .addCommand(listExecutions)
  .addCommand(newExecution)
  .addCommand(executionEvents);

export { cli };
