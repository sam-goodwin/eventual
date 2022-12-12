import {
  Eventual,
  EventualKind,
  EventualBase,
  EventualArrayUnion,
  isEventualOfKind,
  createEventual,
} from "./eventual.js";
import { Failed, Resolved } from "./result.js";

export function isAwaitAny(a: any): a is AwaitAny<any> {
  return isEventualOfKind(EventualKind.AwaitAny, a);
}

export interface AwaitAny<T = any>
  extends EventualBase<EventualKind.AwaitAny, Resolved<T> | Failed> {
  activities: Eventual[];
}

export function createAwaitAny<A extends Eventual[]>(activities: A) {
  return createEventual<AwaitAny<EventualArrayUnion<A>>>(
    EventualKind.AwaitAny,
    {
      activities,
    }
  );
}
