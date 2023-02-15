import {
  Eventual,
  EventualKind,
  EventualBase,
  isEventualOfKind,
  createEventual,
  EventualArrayPositional,
} from "./eventual.js";
import { Failed, Resolved } from "./result.js";

export function isAwaitAll(a: any): a is AwaitAll<any> {
  return isEventualOfKind(EventualKind.AwaitAll, a);
}

export interface AwaitAll<T extends any[] = any[]>
  extends EventualBase<EventualKind.AwaitAll, Resolved<T> | Failed> {
  activities: Eventual[];
}

export function createAwaitAll<A extends Eventual[]>(activities: A) {
  return createEventual<AwaitAll<EventualArrayPositional<A>>>(
    EventualKind.AwaitAll,
    {
      activities,
    }
  );
}
