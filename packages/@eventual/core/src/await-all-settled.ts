import {
  isEventual,
  EventualSymbol,
  Eventual,
  EventualKind,
  EventualBase,
  EventualArrayPromiseResult,
} from "./eventual.js";
import { Resolved } from "./result.js";

export function isAwaitAllSettled(a: any): a is AwaitAllSettled<any> {
  return isEventual(a) && a[EventualSymbol] === EventualKind.AwaitAllSettled;
}

export interface AwaitAllSettled<
  T extends (PromiseFulfilledResult<any> | PromiseRejectedResult)[]
> extends EventualBase<Resolved<T>> {
  [EventualSymbol]: EventualKind.AwaitAllSettled;
  activities: Eventual[];
}

export function createAwaitAllSettled<A extends Eventual[]>(activities: A) {
  return <AwaitAllSettled<EventualArrayPromiseResult<A>>>{
    [EventualSymbol]: EventualKind.AwaitAllSettled,
    activities,
  };
}
