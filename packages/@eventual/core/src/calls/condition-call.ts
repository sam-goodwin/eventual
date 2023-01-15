import { ConditionPredicate } from "../condition.js";
import {
  createEventual,
  Eventual,
  EventualBase,
  EventualKind,
  isEventualOfKind,
} from "../eventual.js";
import { registerEventual } from "../global.js";
import { Resolved, Failed } from "../result.js";

export function isConditionCall(a: any): a is ConditionCall {
  return isEventualOfKind(EventualKind.ConditionCall, a);
}

export interface ConditionCall
  extends EventualBase<EventualKind.ConditionCall, Resolved<boolean> | Failed> {
  seq?: number;
  predicate: ConditionPredicate;
  timeout?: Eventual;
}

export function createConditionCall(
  predicate: ConditionPredicate,
  timeout?: Eventual
) {
  return registerEventual(
    createEventual<ConditionCall>(EventualKind.ConditionCall, {
      predicate,
      timeout,
    })
  );
}
