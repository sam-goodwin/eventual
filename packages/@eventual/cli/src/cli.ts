import { services } from "./commands/services.js";
import { workflows } from "./commands/workflows.js";
import { listExecutions } from "./commands/executions.js";
import { history } from "./commands/history.js";
import { start } from "./commands/start.js";
import { logs } from "./commands/logs.js";
import yargs, { Argv } from "yargs";
import { hideBin } from "yargs/helpers";
import { replay } from "./commands/replay.js";
import { timeline } from "./commands/timeline.js";
import { sendSignal } from "./commands/send-signal.js";
import { execution } from "./commands/execution.js";
import { publishEvents } from "./commands/publish-events.js";
import { configure } from "./commands/configure.js";
import { serviceInfo } from "./commands/service-info.js";

const argv = hideBin(process.argv);

export const listOperation = (yargs: Argv) =>
  yargs.command("list", "List executions, workflows, or services.", (yargs) =>
    [listExecutions, workflows, services]
      .reduce((yargs, command) => command(yargs), yargs)
      .showHelp()
  );

// default is `eventual show service => eventual show`
export const getOperation = (yargs: Argv) =>
  yargs.command(
    ["get", "show"],
    "Get or show an execution, service, timeline, history, logs, or the cli configuration.",
    (yargs) =>
      [execution, history, logs, serviceInfo, configure, timeline].reduce(
        (yargs, command) => command(yargs),
        yargs
      )
  );

export const sendOperation = (yargs: Argv) =>
  yargs.command(
    ["send", "publish"],
    "Send or Publish events and signals",
    (yargs) =>
      [publishEvents, sendSignal]
        .reduce((yargs, command) => command(yargs), yargs)
        .showHelp()
  );

// default is `eventual replay execution => eventual replay`
export const replayOperation = (yargs: Argv) =>
  yargs.command("replay", "Replay executions", (yargs) =>
    [replay].reduce((yargs, command) => command(yargs), yargs)
  );

// default is `eventual start workflow => eventual start`
export const startOperation = (yargs: Argv) =>
  yargs.command("start", "Start a workflow", (yargs) =>
    [start].reduce((yargs, command) => command(yargs), yargs)
  );

const cli = yargs(argv).scriptName("eventual").strict();
[
  listOperation,
  getOperation,
  sendOperation,
  replayOperation,
  startOperation,
].forEach((cmd) => cmd(cli));
if (argv.length === 0) {
  cli.showHelp();
}

export { cli };
