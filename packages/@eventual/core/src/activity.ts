import { currentThreadID, Thread } from "./thread";

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
  threadID: number;
  id: number;
  name: string;
  args: any[];
}

export function isAwaitAll(a: any): a is AwaitAll {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.AwaitAll;
}

export interface AwaitAll {
  [ActivitySymbol]: ActivityKind.AwaitAll;
  activities: Activity[];
  id: number;
}

export namespace Activity {
  export function all(...tasks: Activity[]): AwaitAll {
    return {
      [ActivitySymbol]: ActivityKind.AwaitAll,
      activities: tasks,
      id: nextActivityID(),
    };
  }
}

export function scheduleActivity(
  name: string,
  args: any[],
  props?: {
    id?: number;
    threadID?: number;
  }
): Action {
  return registerActivity<Action>({
    [ActivitySymbol]: ActivityKind.Action,
    id: props?.id ?? nextActivityID(),
    threadID: props?.threadID ?? currentThreadID(),
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
