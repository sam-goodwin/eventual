import {
  createEventual,
  Eventual,
  EventualArrayPromiseResult,
  EventualBase,
  EventualKind,
  isEventualOfKind,
} from "./eventual.js";
import { Resolved } from "./result.js";

export function isAwaitAllSettled(a: any): a is AwaitAllSettled<any> {
  return isEventualOfKind(EventualKind.AwaitAllSettled, a);
}

export interface AwaitAllSettled<
  T extends (PromiseFulfilledResult<any> | PromiseRejectedResult)[]
> extends EventualBase<EventualKind.AwaitAllSettled, Resolved<T>> {
  activities: Eventual[];
}

export function createAwaitAllSettled<A extends Eventual[]>(activities: A) {
  return createEventual<AwaitAllSettled<EventualArrayPromiseResult<A>>>(
    EventualKind.AwaitAllSettled,
    {
      activities,
    }
  );
}
