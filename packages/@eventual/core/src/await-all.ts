import {
  isEventual,
  EventualSymbol,
  Eventual,
  EventualKind,
} from "./eventual.js";
import { Failed, Resolved } from "./result.js";

export function isAwaitAll(a: any): a is AwaitAll<any> {
  return isEventual(a) && a[EventualSymbol] === EventualKind.AwaitAll;
}

export interface AwaitAll<T extends any[] = any[]> {
  [EventualSymbol]: EventualKind.AwaitAll;
  activities: Eventual[];
  result?: Resolved<T> | Failed;
}
