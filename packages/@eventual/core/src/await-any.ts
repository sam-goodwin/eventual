import {
  isEventual,
  EventualSymbol,
  Eventual,
  EventualKind,
  EventualBase,
  EventualArrayUnion,
} from "./eventual.js";
import { Failed, Resolved } from "./result.js";

export function isAwaitAny(a: any): a is AwaitAny<any> {
  return isEventual(a) && a[EventualSymbol] === EventualKind.AwaitAny;
}

export interface AwaitAny<T = any> extends EventualBase<Resolved<T> | Failed> {
  [EventualSymbol]: EventualKind.AwaitAny;
  activities: Eventual[];
}

export function createAwaitAny<A extends Eventual[]>(activities: A) {
  return <AwaitAny<EventualArrayUnion<A>>>{
    [EventualSymbol]: EventualKind.AwaitAny,
    activities,
  };
}
