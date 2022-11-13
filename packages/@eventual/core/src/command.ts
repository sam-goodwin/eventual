import { isActivity, ActivitySymbol, ActivityKind } from "./activity";
import { registerActivity } from "./global";
import { Resolved, Failed } from "./result";

export function isCommand(a: any): a is Command {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.Command;
}

export interface Command<T = any> {
  [ActivitySymbol]: ActivityKind.Command;
  seq?: number;
  name: string;
  args: any[];
  result?: Resolved<T> | Failed;
}

export function createCommand(
  name: string,
  args: any[],
  seq?: number
): Command {
  const command: Command = {
    [ActivitySymbol]: ActivityKind.Command,
    seq,
    name,
    args,
  };
  if (seq !== undefined) {
    // if seq is passed in, then this Command is assumed to be in a dev environment
    // so - do not register it
    return command;
  } else {
    return registerActivity<Command>(command);
  }
}
