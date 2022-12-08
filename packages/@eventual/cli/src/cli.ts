import { services } from "./commands/services.js";
import { workflows } from "./commands/workflows.js";
import { executions } from "./commands/executions.js";
import { history } from "./commands/history.js";
import { start } from "./commands/start.js";
import { logs } from "./commands/logs.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { replay } from "./commands/replay.js";
import { timeline } from "./commands/timeline.js";

const argv = hideBin(process.argv);
const cli = yargs(argv).scriptName("eventual").strict();
[
  services,
  start,
  workflows,
  executions,
  history,
  logs,
  replay,
  timeline,
].forEach((cmd) => cmd(cli));
if (argv.length == 0) {
  cli.showHelp();
}

export { cli };
