import { Program } from "./interpret";
import { Failed, Resolved, Result } from "./result";

export const ActivitySymbol = Symbol.for("eventual:Activity");

export enum ActivityKind {
  AwaitAll = 0,
  Action = 1,
  Thread = 2,
}

export function isActivity(a: any): a is Activity {
  return a && typeof a === "object" && ActivitySymbol in a;
}

export type Activity<T = any> =
  | Action<T>
  | AwaitAll<T extends any[] ? T : never>
  | Thread<T>;

export function isAction(a: any): a is Action {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.Action;
}

export interface Action<T = any> {
  [ActivitySymbol]: ActivityKind.Action;
  seq?: number;
  name: string;
  args: any[];
  result?: Resolved<T> | Failed;
}

export function isAwaitAll(a: any): a is AwaitAll<any> {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.AwaitAll;
}

export interface AwaitAll<T extends any[] = any[]> {
  [ActivitySymbol]: ActivityKind.AwaitAll;
  activities: Activity[];
  result?: Resolved<T> | Failed;
}

export namespace Activity {
  export function all<A extends Activity[]>(
    activities: A
  ): AwaitAll<{
    [i in keyof A]: A[i] extends Activity<infer T> ? T : A[i];
  }> {
    return {
      [ActivitySymbol]: ActivityKind.AwaitAll,
      activities,
    };
  }
}

export function activity<F extends (...args: any[]) => any>(
  activityID: string,
  _underlying: F
): (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>> {
  return (...args) => scheduleAction(activityID, args) as any;
}

export function scheduleAction(
  name: string,
  args: any[],
  seq?: number
): Action {
  const action: Action = {
    [ActivitySymbol]: ActivityKind.Action,
    seq,
    name,
    args,
  };
  if (seq !== undefined) {
    // if seq is passed in, this action is assumed to be in a dev environment
    // so - do not register it
    return action;
  } else {
    return registerActivity<Action>(action);
  }
}

function registerActivity<A extends Activity>(activity: A): A {
  activityCollector.push(activity);
  return activity;
}

let activityCollector: Activity[] = [];

export function resetActivityCollector() {
  activityCollector = [];
}

export function collectActivities() {
  const activities = activityCollector;
  resetActivityCollector();
  return activities;
}

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
