import { ConditionPredicate } from "../condition.js";
import {
  createEventual,
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
  timeoutSeconds?: number;
}

export function createConditionCall(
  predicate: ConditionPredicate,
  timeoutSeconds?: number
) {
  return registerEventual(
    createEventual<ConditionCall>(EventualKind.ConditionCall, {
      predicate,
      timeoutSeconds,
    })
  );
}
