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
  seq: number;
  name: string;
  args: any[];
  result?: Resolved<T> | Failed;
}

export function isAwaitAll(a: any): a is AwaitAll<any> {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.AwaitAll;
}

export interface AwaitAll<T extends any[] = any[]> {
  [ActivitySymbol]: ActivityKind.AwaitAll;
  seq: number;
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
      seq: nextActivityID(),
      activities,
    };
  }
}

export function activity<F extends (...args: any[]) => any>(
  activityID: string,
  underlying: F
): (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>> {
  if (
    !underlying ||
    typeof underlying === "string" ||
    typeof underlying === "number" ||
    typeof underlying === "boolean"
  ) {
    return underlying;
  }
  return new Proxy(
    {},
    {
      apply: (_target, _this, args) => {
        return scheduleActivity(activityID, args);
      },
    }
  ) as any;
}

export function scheduleActivity(
  name: string,
  args: any[],
  seq?: number
): Action {
  return registerActivity<Action>({
    [ActivitySymbol]: ActivityKind.Action,
    seq: seq ?? nextActivityID(),
    name,
    args,
  });
}

export function registerActivity<A extends Activity>(activity: A): A {
  activitiesGlobal.push(activity);
  return activity;
}

let activityIDCounter = 0;
let activitiesGlobal: Activity[] = [];

export function nextActivityID() {
  return activityIDCounter++;
}

export function resetActivityIDCounter() {
  activityIDCounter = 0;
}

export function resetActivities() {
  activitiesGlobal = [];
}

export function getSpawnedActivities() {
  return [...activitiesGlobal];
}

export function isThread(a: any): a is Thread {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.Thread;
}

export interface Thread<T = any> {
  [ActivitySymbol]: ActivityKind.Thread;
  program: Program;
  result?: Result<T>;
  awaiting?: Activity;
  id: number;
}

let threadIDCounter = 0;

export function resetThreadIDCounter() {
  threadIDCounter = 0;
}

export function createThread(program: Program): Thread {
  return {
    [ActivitySymbol]: ActivityKind.Thread,
    program,
    id: threadIDCounter++,
  };
}

export function scheduleThread(program: Program): Thread {
  return registerActivity(createThread(program));
}
