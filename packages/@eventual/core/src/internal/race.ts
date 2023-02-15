import {
  Eventual,
  EventualKind,
  EventualBase,
  EventualArrayUnion,
  createEventual,
  isEventualOfKind,
} from "./eventual.js";
import { Failed, Resolved } from "./result.js";

export function isRace(a: any): a is Race<any> {
  return isEventualOfKind(EventualKind.Race, a);
}

export interface Race<T = any>
  extends EventualBase<EventualKind.Race, Resolved<T> | Failed> {
  activities: Eventual[];
}

export function createRace<A extends Eventual[]>(activities: A) {
  return createEventual<Race<EventualArrayUnion<A>>>(EventualKind.Race, {
    activities,
  });
}
