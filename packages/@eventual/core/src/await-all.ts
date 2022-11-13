import { Activity, ActivityKind, ActivitySymbol, isActivity } from "./activity";
import { Failed, Resolved } from "./result";

export function isAwaitAll(a: any): a is AwaitAll<any> {
  return isActivity(a) && a[ActivitySymbol] === ActivityKind.AwaitAll;
}

export interface AwaitAll<T extends any[] = any[]> {
  [ActivitySymbol]: ActivityKind.AwaitAll;
  activities: Activity[];
  result?: Resolved<T> | Failed;
}
