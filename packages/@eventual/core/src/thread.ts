import { isActivity, ActivitySymbol, ActivityKind, Activity } from "./activity";
import { registerActivity } from "./global";
import { Program } from "./interpret";
import { Result } from "./result";

export function isThread(a: any): a is Thread {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.Thread;
}

export interface Thread<T = any> extends Program<T> {
  [ActivitySymbol]: ActivityKind.Thread;
  result?: Result<T>;
  awaiting?: Activity;
}

export function createThread(program: Program): Thread {
  (program as any)[ActivitySymbol] = ActivityKind.Thread;
  return program as Thread;
}

export function scheduleThread(program: Program): Thread {
  return registerActivity(createThread(program));
}
