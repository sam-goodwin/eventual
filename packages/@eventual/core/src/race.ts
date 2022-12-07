import {
  isEventual,
  EventualSymbol,
  Eventual,
  EventualKind,
  EventualBase,
  EventualArrayUnion,
} from "./eventual.js";
import { Failed, Resolved } from "./result.js";

export function isRace(a: any): a is Race<any> {
  return isEventual(a) && a[EventualSymbol] === EventualKind.Race;
}

export interface Race<T = any> extends EventualBase<Resolved<T> | Failed> {
  [EventualSymbol]: EventualKind.Race;
  activities: Eventual[];
}

export function createRace<A extends Eventual[]>(activities: A) {
  return <Race<EventualArrayUnion<A>>>{
    [EventualSymbol]: EventualKind.Race,
    activities,
  };
}
