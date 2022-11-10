export type Activity = Action | AwaitAll;

export const ActivitySymbol = Symbol.for("eventual:Activity");

export enum ActivityKind {
  AwaitAll = 0,
  Action = 1,
}

export namespace Activity {
  export function all(...tasks: Activity[]): AwaitAll {
    return {
      [ActivitySymbol]: ActivityKind.AwaitAll,
      activities: tasks,
      index: nextIndex(),
    };
  }
}

export interface Action {
  [ActivitySymbol]: ActivityKind.Action;
  index: number;
  name: string;
  args: any[];
}

export interface AwaitAll {
  [ActivitySymbol]: ActivityKind.AwaitAll;
  activities: Activity[];
  index: number;
}

export function isActivity(a: any): a is Activity {
  return a && typeof a === "object" && ActivitySymbol in a;
}

export function isAction(a: any): a is Action {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.Action;
}

export function isAwaitAll(a: any): a is AwaitAll {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.AwaitAll;
}

export function scheduleActivity(
  name: string,
  args: any[],
  index?: number
): Action {
  return registerActivity({
    [ActivitySymbol]: ActivityKind.Action,
    index: index ?? nextIndex(),
    name,
    args,
  });
}

let indexGlobal = 0;
let activitiesGlobal: Activity[] = [];

export function reset() {
  resetActivities();
  resetIndex();
}

export function resetActivities() {
  activitiesGlobal = [];
}

export function getActivities() {
  return [...activitiesGlobal];
}

export function registerActivity<A extends Activity>(activity: A): A {
  activitiesGlobal.push(activity);
  return activity;
}

export function resetIndex() {
  indexGlobal = 0;
}

export function nextIndex() {
  return indexGlobal++;
}
