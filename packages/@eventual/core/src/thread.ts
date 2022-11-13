import { isActivity, ActivitySymbol, ActivityKind, Activity } from "./activity";
import { registerActivity } from "./global";
import { Program } from "./interpret";
import { Result } from "./result";

export function isThread(a: any): a is Thread {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.Thread;
}

export interface Thread<T = any> {
  [ActivitySymbol]: ActivityKind.Thread;
  program: Program;
  result?: Result<T>;
  awaiting?: Activity;
}

export function createThread(program: Program): Thread {
  return {
    [ActivitySymbol]: ActivityKind.Thread,
    program,
  };
}

export function scheduleThread(program: Program): Thread {
  return registerActivity(createThread(program));
}
