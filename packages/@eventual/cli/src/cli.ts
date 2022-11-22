import { executions } from "./commands/executions.js";
import { history } from "./commands/history.js";
import { start } from "./commands/start.js";
import { workflows } from "./commands/workflows.js";
import { logs } from "./commands/logs.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const argv = hideBin(process.argv);
const cli = yargs(argv);
[workflows, start, executions, history, logs].forEach((cmd) => cmd(cli));

if (argv.length == 0) {
  cli.showHelp();
}

export { cli };
