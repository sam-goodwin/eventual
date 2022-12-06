import {
  isEventual,
  EventualSymbol,
  Eventual,
  EventualKind,
  EventualBase,
} from "./eventual.js";
import { Failed, Resolved } from "./result.js";

export function isAwaitAll(a: any): a is AwaitAll<any> {
  return isEventual(a) && a[EventualSymbol] === EventualKind.AwaitAll;
}

export interface AwaitAll<T extends any[] = any[]>
  extends EventualBase<Resolved<T> | Failed> {
  [EventualSymbol]: EventualKind.AwaitAll;
  activities: Eventual[];
}

export function createAwaitAll<A extends Eventual[]>(activities: A) {
  return <
    AwaitAll<{
      [i in keyof A]: A[i] extends Eventual<infer T> ? T : A[i];
    }>
  >{
    [EventualSymbol]: EventualKind.AwaitAll,
    activities,
  };
}
