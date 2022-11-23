import { executions } from "./commands/executions.js";
import { history } from "./commands/history.js";
import { start } from "./commands/start.js";
import { workflows } from "./commands/workflows.js";
import { logs } from "./commands/logs.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { replay } from "./commands/replay.js";

const argv = hideBin(process.argv);
const cli = yargs(argv);
[workflows, start, executions, history, logs, replay].forEach((cmd) =>
  cmd(cli)
);

if (argv.length == 0) {
  cli.showHelp();
}

export { cli };
