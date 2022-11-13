import { Program } from "./interpret";

export const ActivitySymbol = Symbol.for("eventual:Activity");

export enum ActivityKind {
  AwaitAll = 0,
  Action = 1,
  Thread = 2,
}

export function isActivity(a: any): a is Activity {
  return a && typeof a === "object" && ActivitySymbol in a;
}

export type Activity = Action | AwaitAll | Thread;

export function isAction(a: any): a is Action {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.Action;
}

export interface Action {
  [ActivitySymbol]: ActivityKind.Action;
  seq: number;
  name: string;
  args: any[];
}

export function isAwaitAll(a: any): a is AwaitAll {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.AwaitAll;
}

export interface AwaitAll {
  [ActivitySymbol]: ActivityKind.AwaitAll;
  seq: number;
  activities: Activity[];
}

export namespace Activity {
  export function all(activities: Activity[]): AwaitAll {
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
  id?: number
): Action {
  return registerActivity<Action>({
    [ActivitySymbol]: ActivityKind.Action,
    seq: id ?? nextActivityID(),
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

export interface Thread {
  [ActivitySymbol]: ActivityKind.Thread;
  seq: number;
  program: Program;
  awaiting?: Activity;
}

export function createThread(program: Program): Thread {
  return {
    [ActivitySymbol]: ActivityKind.Thread,
    seq: nextActivityID(),
    program,
  };
}

export function scheduleThread(program: Program): Thread {
  return registerActivity(createThread(program));
}
