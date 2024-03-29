import yargs, { Argv } from "yargs";
import { hideBin } from "yargs/helpers";
import { configure } from "./commands/configure.js";
import { create } from "./commands/create.js";
import { execution } from "./commands/execution.js";
import { listExecutions } from "./commands/executions.js";
import { history } from "./commands/history.js";
import { invokeCommand } from "./commands/invoke.js";
import { local } from "./commands/local.js";
import { logs } from "./commands/logs.js";
import { emitEvents } from "./commands/emit-events.js";
import { replay } from "./commands/replay.js";
import { sendSignal } from "./commands/send-signal.js";
import { serviceInfo } from "./commands/service-info.js";
import { services } from "./commands/services.js";
import { start } from "./commands/start.js";
import { timeline } from "./commands/timeline.js";
import { workflows } from "./commands/workflows.js";

const argv = hideBin(process.argv);

/**
 * CLI
 *
 * <verb> <resource> [resourceId] [args]
 *
 * * the first value MUST be a **verb**
 * * the second value MUST be a singular or plural **resource** name (workflow, execution, event, signal, service)
 * * when the **resource** is singular and one of the arguments is the ID or name of the resource
 *      the 3rd positional argument MUST be the ID/name.
 * * if the **resource** is a sub-property of another resource (ex: execution history), the resource ID SHOULD be a flag
 */

export const listOperation = (yargs: Argv) =>
  yargs.command(
    "list",
    "List executions, workflows, or services.",
    addSubCommands(listExecutions, workflows, services)
  );

export const getOperation = (yargs: Argv) =>
  yargs.command(
    ["get", "show"],
    "Get or show an execution, service, timeline, history, logs, or the cli configuration.",
    addSubCommands(execution, history, logs, serviceInfo, configure, timeline),
    () => {
      yargs.showHelp();
    }
  );

export const emitOperation = (yargs: Argv) =>
  yargs.command(
    ["publish", "emit"],
    "Emit events",
    addSubCommands(emitEvents, sendSignal)
  );

export const sendOperation = (yargs: Argv) =>
  yargs.command("send", "Send signals", addSubCommands(emitEvents, sendSignal));

export const replayOperation = (yargs: Argv) =>
  yargs.command("replay", "Replay executions", addSubCommands(replay));

export const startOperation = (yargs: Argv) =>
  yargs.command("start", "Start a workflow", addSubCommands(start));

export const createOperation = (yargs: Argv) =>
  yargs.command("create", "Create an eventual service", addSubCommands(create));

const cli = yargs(argv).scriptName("eventual").strict();

addSubCommands(
  listOperation,
  getOperation,
  sendOperation,
  emitOperation,
  replayOperation,
  startOperation,
  createOperation,
  invokeCommand,
  local
)(cli);

if (argv.length === 0) {
  cli.showHelp();
}

export { cli };

function addSubCommands(...commands: ((yargs: Argv) => Argv)[]) {
  return (yargs: Argv) =>
    commands.reduce((yargs, command) => command(yargs), yargs);
}
