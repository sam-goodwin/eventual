import { program } from "commander";
import { addCommands } from "./command.js";
import { executions } from "./commands/executions.js";
import { status } from "./commands/status.js";
import { start } from "./commands/start.js";
import { workflows } from "./commands/workflows.js";

const cli = program.name("eventual").description("Eventual CLI");

addCommands(cli, { workflows, start, executions, status });

export { cli };
